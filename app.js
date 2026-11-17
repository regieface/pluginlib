// PluginLib — interface. Les données vivent dans data/*.json (mises à jour à la demande via GitHub Actions).
const moduleVersion = window.PL_V || 1;
const { productDescription } = await import(`./descriptions.mjs?v=${moduleVersion}`);
const { PLATFORMS, CATALOG_STATUSES, hasDocumentedLatency, formatPrice, isPriceStale } = await import(`./catalog.mjs?v=${moduleVersion}`);
const { defaultSelections, availabilityGroup, availabilityOnScopeChange, changeSelection, matchesPluginSelections, clearIrrelevantFacets, contextualCounts } = await import(`./filters.mjs?v=${moduleVersion}`);
const { mountMultiSelect } = await import(`./multi-select.mjs?v=${moduleVersion}`);
const { RECORD_TYPES } = await import(`./record-types.mjs?v=${moduleVersion}`);
const { normalizeCollection, mergeCollection, collectionStatus, matchesCollectionScope, exportCollection, planFor, isPlanMember, subscriptionKey } = await import(`./collection.mjs?v=${moduleVersion}`);
const { bindCollectionImport, previewCollectionImport } = await import(`./collection-import.mjs?v=${moduleVersion}`);
const { CONTROLLER_STATUS_LABELS, collectionControllerStatus } = await import(`./controller-status.mjs?v=${moduleVersion}`);
const { controllerRequestOptions, createControllerRequest } = await import(`./controller-request.mjs?v=${moduleVersion}`);
const $ = (s) => document.querySelector(s);
const descriptionObserver=new ResizeObserver(entries=>{for(const {target:text} of entries){if(!text.isConnected)continue;const block=text.closest('.description'),toggle=block.querySelector('.description-toggle');toggle.hidden=!block.classList.contains('expanded')&&text.scrollHeight<=text.clientHeight+1;}});
const STATUS_KEY = 'pluginlib.status.v2';
const STATUS = { unknown: '—', owned: 'Licence perpétuelle', subscription: 'Abonnement actif', former: 'Ancien abonnement', trial: 'Démo', wishlist: 'Liste d’envies', not_owned: 'Non possédé' };
const PAGE = 30;

let DATA = [], META = null, LBL = null, status = {}, subscriptions = [], unmatchedLicenses = [], licenseDetails = {}, PLANS = [], CONTROLLER_MANIFEST = { schemaVersion: 1, links: [] }, shown = PAGE;
const st = { scope: 'owned', q: '', zl: 'all', rate: '96', links: 'all', visual: 'all', sort: 'az' };
let selections = defaultSelections([], st.scope);
const availabilityFilters = new Map();
const filterControls = new Map(), filterChoices = new Map();

// Collection : statut par plugin (reprise de l'ancien format « étoile » si présent)
try {
  status = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {};
  subscriptions = JSON.parse(localStorage.getItem('pluginlib.subscriptions.v1') || '[]') || [];
  unmatchedLicenses=JSON.parse(localStorage.getItem('pluginlib.unmatchedLicenses.v1')||'[]');
  licenseDetails=JSON.parse(localStorage.getItem('pluginlib.licenseDetails.v1')||'{}');
  const old = JSON.parse(localStorage.getItem('pluginlib.owned.v1') || '[]');
  old.forEach((id) => { if (!status[id]) status[id] = 'owned'; });
} catch { status = {}; }
const save = () => { try { localStorage.setItem(STATUS_KEY, JSON.stringify(status)); localStorage.setItem('pluginlib.subscriptions.v1',JSON.stringify(subscriptions));localStorage.setItem('pluginlib.unmatchedLicenses.v1',JSON.stringify(unmatchedLicenses));localStorage.setItem('pluginlib.licenseDetails.v1',JSON.stringify(licenseDetails)); } catch { /* stockage indisponible */ } };
const currentCollection=()=>({status,subscriptions,unmatchedLicenses,licenseDetails});
const licenseStatus=p=>collectionStatus(p,currentCollection(),PLANS);

const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (n) => n.toLocaleString('fr-FR');
const ms = (samples, khz) => (samples / (Number(khz) * 1000) * 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function lat(p, rate) {
  const c = p.latency?.[rate];
  if (!c) return null;
  return { ...c, zero: c.samples === 0, zeroMode: (c.variants || []).some((v) => v.samples === 0) };
}

// ---------- Chargement ----------
async function load() {
  const [d, m, plans, descriptions, controllerManifest] = await Promise.all([
    fetch('data/plugins.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/subscriptions.json', { cache: 'no-cache' }).then(r=>r.ok?r.json():{plans:[]}).catch(()=>({plans:[]})),
    fetch('data/descriptions-fr.json', { cache: 'no-cache' }).then(r=>r.ok?r.json():{}).catch(()=>({})),
    fetch('controller/profile-manifest.json', { cache: 'no-cache' }).then(r=>r.ok?r.json():{schemaVersion:1,links:[]}).catch(()=>({schemaVersion:1,links:[]}))
  ]);
  META = m; LBL = m.labels;
  CONTROLLER_MANIFEST = controllerManifest;
  PLANS=plans.plans||[];
  ({status,subscriptions,unmatchedLicenses,licenseDetails}=normalizeCollection(currentCollection(),d.plugins,PLANS));
  DATA = d.plugins.filter(p=>!p.duplicateOf&&!p.exclude).map((p) => {
    const presentation = productDescription(p,descriptions),summary=presentation.text;
    return { ...p, summary, presentation, _s: norm(`${p.name} ${(p.aliases || []).join(' ')} ${p.vendor} ${p.description} ${summary} ${LBL.categories[p.category] || ''}`) };
  });
  save();stats(); fillStatic(); renderSubscriptions();render();
  $('#import').disabled = false;
}

function renderSubscriptions(){
  $('#subscriptionOptions').replaceChildren(...PLANS.map(plan=>{
    const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';
    checkbox.checked=subscriptions.some(s=>subscriptionKey(s)===subscriptionKey(plan)&&s.status==='active');
    checkbox.addEventListener('change',()=>{const s={vendor:plan.vendor,plan:plan.plan,status:checkbox.checked?'active':'inactive',source:'Déclaration du propriétaire'};({status,subscriptions,unmatchedLicenses,licenseDetails}=mergeCollection(currentCollection(),{subscriptions:[s]},DATA,PLANS));save();renderSubscriptions();render();});
    label.append(checkbox,` ${plan.vendor} ${plan.plan} · ${DATA.filter(p=>isPlanMember(p,plan)).length} plugins du catalogue`);return label;
  }));
}

function stats() {
  $('#total').textContent = fmt(DATA.length);
  $('#makers').textContent = fmt(new Set(DATA.map((p) => p.vendor)).size);
  $('#latstat').textContent = fmt(DATA.filter(hasDocumentedLatency).length);
  $('#linkstat').textContent = fmt(DATA.filter((p) => p.url).length);
  const pendingFamilies = DATA.filter((p) => p.category === 'other').length;
  $('#familyCoverage').textContent = `Catalogue : ${fmt(DATA.length - pendingFamilies)} familles renseignées · ${fmt(pendingFamilies)} familles à vérifier.`;
  if (META.generatedAt) {
    const d = new Date(META.generatedAt);
    $('#headright').innerHTML = `Mise à jour du catalogue à la demande<br>Dernière : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  $('#sources').innerHTML = '<tr><th>Fabricant</th><th>État</th><th>Méthode</th><th>Plugins</th></tr>' +
    META.sources.map((s) => `<tr><td><a href="${esc(s.site)}" target="_blank" rel="noopener">${esc(s.vendor)}</a></td><td class="${s.ok ? 'ok' : 'ko'}">${s.ok ? 'À jour' : 'Échec' + (s.kept ? ' — données précédentes conservées' : '')}</td><td>${esc(s.via)}</td><td>${s.kept}</td></tr>`).join('') +
    `<tr><td><a href="${esc(META.latency.url || '#')}" target="_blank" rel="noopener">Latences Waves</a></td><td class="${META.latency.ok ? 'ok' : 'ko'}">${META.latency.ok ? 'À jour' : 'Échec'}</td><td>tableau officiel</td><td>${META.latency.rows ?? '—'}</td></tr>`;
}

function fillStatic() {
  selections = defaultSelections(Object.keys(LBL.facets), st.scope);
  const fam = {}; DATA.forEach((p) => { fam[p.category] = (fam[p.category] || 0) + 1; });
  addMulti('family', 'Familles', 'Toutes les familles', Object.entries(LBL.categories).filter(([id]) => fam[id]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => [id, label, fam[id]]));
  const mk = {}; DATA.forEach((p) => { mk[p.vendor] = (mk[p.vendor] || 0) + 1; });
  addMulti('maker', 'Fabricants', 'Tous les fabricants', Object.keys(mk).sort((a, b) => a.localeCompare(b)).map((value) => [value, value, mk[value]]));
  addMulti('option', 'Fonctions', 'Toutes les fonctions', Object.entries(LBL.common).map(([key, label]) => [`opt:${key}`, label]));
  addMulti('platform', 'Plateformes', 'Toutes les plateformes', [...Object.entries(PLATFORMS), ['unknown', 'Compatibilité à vérifier']]);
  addMulti('catalogStatus', 'Disponibilité', 'Tous les statuts', Object.entries(CATALOG_STATUSES));
  addMulti('recordType', 'Type de fiche', 'Tous les types', Object.entries(RECORD_TYPES));
  for (const [key, def] of Object.entries(LBL.facets)) {
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('div'); label.className = 'filter-label';
    label.textContent = key === 'espace' ? 'Type d’espace' : def.label;
    const root = document.createElement('div'); root.id = `facet-${key}`;
    field.append(label, root); $('#facetFilters').append(field);
    const options = Object.entries(def.values).map(([value, text]) => [`${key}:${value}`, text, DATA.filter((p) => p.tags.includes(`${key}:${value}`)).length]).filter(([, , count]) => count);
    addMulti(key, label.textContent, 'Indifférent', options, root);
  }
  renderActiveFilters();
}

function addMulti(key, label, emptyLabel, options, root = $('#' + key)) {
  filterChoices.set(key, { label, options, root });
  filterControls.set(key, mountMultiSelect(root, { label, emptyLabel, options, getSelection: () => selections[key], onChange: (next) => {
    selections[key] = next;
    if (key === 'family') reconcileFamilyCriteria();
    renderActiveFilters(); rerender();
  } }));
}

function reconcileFamilyCriteria() {
  const cleared = clearIrrelevantFacets(DATA, selections, LBL.facets);
  const notice = $('#filterNotice');
  notice.textContent = cleared.length ? `Critères retirés car sans objet pour les familles choisies : ${cleared.map((key) => LBL.facets[key].label).join(', ')}.` : '';
  notice.hidden = !cleared.length;
}

function renderActiveFilters() {
  const chips = document.createDocumentFragment();
  for (const [key, { label, options }] of filterChoices) {
    for (const mode of ['include', 'exclude']) for (const value of selections[key][mode]) {
      const text = options.find(([id]) => id === value)?.[1] || value;
      const button = document.createElement('button'); button.type = 'button'; button.className = `filter-chip ${mode}`;
      button.textContent = `${mode === 'exclude' ? 'Exclure ' : ''}${text} ×`;
      button.setAttribute('aria-label', `Retirer le filtre ${label} : ${mode === 'exclude' ? 'exclure ' : ''}${text}`);
      button.addEventListener('click', () => {
        selections[key] = changeSelection(selections[key], value, mode, false);
        if (key === 'family') reconcileFamilyCriteria();
        filterControls.get(key)(); renderActiveFilters(); rerender();
      });
      chips.append(button);
    }
  }
  $('#activeFilters').replaceChildren(chips);
}

// ---------- Filtrage ----------
function filtered(ignoreSelections = false) {
  const terms = norm(st.q).split(/\s+/).filter(Boolean);
  return DATA.filter((p) => {
    if (!ignoreSelections && !matchesPluginSelections(p, selections)) return false;
    if (!matchesCollectionScope(licenseStatus(p), st.scope)) return false;
    if (terms.length && !terms.every((t) => p._s.includes(t))) return false;
    const l = lat(p, st.rate);
    if (st.zl === 'zero' && !(l && l.zero)) return false;
    if (st.zl === 'zeromode' && !(l && (l.zero || l.zeroMode)) && !p.latencyInfo?.zero) return false;
    if (st.zl === 'announced' && !p.tags.includes('opt:zl') && !(l && l.zero) && !p.latencyInfo?.zero) return false;
    if (st.zl === 'known' && !hasDocumentedLatency(p)) return false;
    if (st.links === 'yes' && !p.url) return false;
    if (st.links === 'no' && p.url) return false;
    if (st.visual === 'yes' && !p.image) return false;
    if (st.visual === 'no' && p.image) return false;
    return true;
  });
}

function refreshContextualFilters() {
  const candidates = filtered(true);
  for (const [key, { root }] of filterChoices) {
    const counts = contextualCounts(candidates, selections, key, LBL.facets);
    const active = selections[key].include.length || selections[key].exclude.length;
    const hidden = !!LBL.facets[key] && !counts.size && !active;
    root.closest('.field').hidden = hidden;
    if (hidden) root.querySelector('details').open = false;
    filterControls.get(key)({ counts });
  }
}

function latCell(p, rate) {
  const l = lat(p, rate);
  if (!l) return `<div class="lat"><span>${rate} kHz</span><b>—</b><small>non publiée</small></div>`;
  if (l.samples != null) return `<div class="lat ${l.zero ? 'zero' : ''}"><span>${rate} kHz</span><b>${l.samples} sample${l.samples > 1 ? 's' : ''}</b><small>${ms(l.samples, rate)} ms</small></div>`;
  if (l.variants) return `<div class="lat ${l.zeroMode ? 'zero' : ''}"><span>${rate} kHz · selon mode</span>${l.variants.map((v) => `<small>${esc(v.label)} : <b style="display:inline">${v.samples}</b></small>`).join('')}</div>`;
  return `<div class="lat"><span>${rate} kHz</span><small title="${esc(l.note)}">${esc(l.note).slice(0, 80)}</small></div>`;
}

function card(p) {
  const n = $('#tpl').content.cloneNode(true);
  const currentLicenseStatus = licenseStatus(p);
  n.querySelector('.card').classList.toggle('licensed', ['owned', 'subscription'].includes(currentLicenseStatus));
  const img = n.querySelector('img');
  n.querySelector('.fallback b').textContent = p.vendor.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  n.querySelector('.fallback span').textContent = LBL.categories[p.category] || '';
  if (p.image) {
    const art = n.querySelector('.art');
    img.onload = () => art.classList.add('has-image');
    img.onerror = () => { art.classList.remove('has-image'); img.remove(); };
    img.alt = p.name; img.src = p.image;
  } else img.remove();
  const l = lat(p, st.rate);
  n.querySelector('.ribbon').textContent = l?.zero ? `Zero latency · ${st.rate} kHz` : l?.zeroMode ? `ZL selon mode · ${st.rate} kHz` : '';
  n.querySelector('.maker').textContent = p.vendor;
  n.querySelector('.plugin').textContent = p.name;
  const description=n.querySelector('.description');
  const text=document.createElement('p');text.className='description-text';text.id=`description-${p.id}`;text.textContent=p.summary;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='description-toggle';toggle.textContent='Lire la suite';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',text.id);toggle.hidden=true;
  toggle.addEventListener('click',()=>{const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Réduire':'Lire la suite';description.classList.toggle('expanded',expanded);});
  description.append(text,toggle);
  if(p.presentation.url){const source=document.createElement('a');source.className='description-source';source.href=p.presentation.url;source.target='_blank';source.rel='noopener';source.textContent=p.presentation.label+' ↗';description.append(source);}
  descriptionObserver.observe(text);
  const tagLabel = (tag) => { const [f, v] = tag.split(':'); return f === 'opt' ? LBL.common[v] : LBL.facets[f]?.values[v]; };
  const tags = p.tags.map((id) => ({ id, label: tagLabel(id) })).filter((t) => t.label);
  const familyEvidence = p.categoryEvidence;
  const familyLabel = esc(LBL.categories[p.category] || p.category);
  const familyBadge = p.category !== 'other' && familyEvidence?.url
    ? `<a class="badge fam" href="${esc(familyEvidence.url)}" target="_blank" rel="noopener" title="${esc(familyEvidence.excerpt || 'Fonction principale documentée')}">${familyLabel} ↗</a>`
    : `<span class="badge fam" title="Fonction principale non confirmée">${familyLabel}</span>`;
  const discontinuedBadge = p.catalogStatus === 'discontinued'
    ? `<span class="badge discontinued"${p.statusEvidence?.url ? ` title="${esc(p.statusEvidence.url)}"` : ''}>${CATALOG_STATUSES.discontinued}</span>`
    : '';
  n.querySelector('.badges').innerHTML = discontinuedBadge + familyBadge + tags.map(({id,label}) => {
    const proof = p.featureEvidence?.[id];
    const level = proof?.method === 'reviewed-source' ? 'Source vérifiée' : proof?.method === 'latency-table' ? 'Tableau officiel' : 'Annoncé dans le nom ou la description éditeur';
    return proof?.url ? `<a class="badge" href="${esc(proof.url)}" target="_blank" rel="noopener" title="${esc(`${level} · ${proof.excerpt || 'Source propre au produit'}`)}">${esc(label)} ↗</a>` : `<span class="badge">${esc(label)}</span>`;
  }).join('') + (familyEvidence?.method === 'reviewed-source' ? '<span class="badge ok">Famille vérifiée</span>' : '');
  if (p.unverifiedTags?.length) {
    const review = document.createElement('details'); review.className = 'feature-review';
    const summary = document.createElement('summary'); summary.textContent = `${p.unverifiedTags.length} critère${p.unverifiedTags.length > 1 ? 's' : ''} à vérifier`;
    const text = document.createElement('div'); text.textContent = `${p.unverifiedTags.map((tag) => tagLabel(tag) || tag).join(' · ')}. Ces critères sont écartés des filtres tant qu’ils ne sont pas confirmés.`;
    review.append(summary,text); n.querySelector('.badges').after(review);
  }
  const metadata = n.querySelector('.metadata');
  const availability = p.catalogStatus === 'discontinued' ? '' : ` · ${CATALOG_STATUSES[p.catalogStatus] || CATALOG_STATUSES.unknown}`;
  metadata.textContent = `${p.platforms?.length ? p.platforms.map((id) => PLATFORMS[id]).filter(Boolean).join(' · ') : 'Plateformes à vérifier'}${availability}${p.recordType && !['effect','unknown'].includes(p.recordType) ? ` · ${RECORD_TYPES[p.recordType]}` : ''}`;
  metadata.title = [p.platformEvidence?.url, p.statusEvidence?.url].filter(Boolean).join('\n');
  if (p.replacedBy) {
    const successor = document.createElement(p.replacedBy.url ? 'a' : 'span');
    if (p.replacedBy.url) { successor.href = p.replacedBy.url; successor.target = '_blank'; successor.rel = 'noopener'; }
    successor.textContent = ` · Remplacé par ${p.replacedBy.name}`;
    metadata.append(successor);
  }
  if (p.colorationInfo) {
    const info = p.colorationInfo;
    const note = document.createElement('div'); note.className = 'coloration-note';
    note.append(document.createTextNode(`${info.noteFr} `));
    const source = document.createElement('a'); source.href = info.url; source.target = '_blank'; source.rel = 'noopener';
    source.textContent = 'Source ↗'; source.title = info.method === 'reviewed-source' ? 'Fiche ou manuel officiel vérifié' : 'Description constructeur · classement automatique';
    note.append(source); metadata.after(note);
  }
  const prices = n.querySelector('.prices');
  if (p.pricing) {
    const price = p.pricing;
    const priceSource = price.sourceName || 'Éditeur';
    const stale = isPriceStale(price);
    prices.innerHTML = `<span>Normal : <b>${price.normal != null ? esc(formatPrice(price.normal, price.currency)) : '—'}</b></span><span class="promo">${stale ? 'Dernière promo' : 'Promo relevée'} : <b>${price.promo != null ? esc(formatPrice(price.promo, price.currency)) : '—'}</b></span>${price.isRange ? '<small>À partir de · selon édition</small>' : ''}<small><a href="${esc(price.url)}" target="_blank" rel="noopener">${esc(priceSource)} · relevé le ${new Date(price.checkedAt).toLocaleDateString('fr-FR')}</a></small>${stale ? '<small class="price-stale">Dernier tarif connu · à revérifier</small>' : ''}`;
    prices.title = `Tarifs ${priceSource}, sans conversion. Taxes et conditions selon le vendeur.\n${price.url}`;
  } else if (p.catalogStatus === 'free') prices.textContent = p.freeLabel || 'Gratuit';
  else prices.textContent = 'Prix normal / promo non publiés';
  const latencyInfo = p.latencyInfo;
  n.querySelector('.latbox').innerHTML = p.latency ? latCell(p, '48') + latCell(p, '96') : '';
  if (latencyInfo) {
    const note = document.createElement('div');
    note.className = 'latency-note';
    const values = (latencyInfo.values || []).map((v) => `${v.value} ${v.unit}`).join(' / ');
    note.textContent = latencyInfo.noteFr || `${latencyInfo.conditional ? 'Selon le mode : ' : 'Latence publiée : '}${values || (latencyInfo.zero ? 'zéro latence annoncé' : '')}${latencyInfo.sampleRate ? ` à ${latencyInfo.sampleRate} kHz` : values ? ' · fréquence non précisée' : ''}`;
    note.title = latencyInfo.excerpt;
    n.querySelector('.latbox').append(note);
    if (latencyInfo.modes?.length) {
      const details = document.createElement('details');
      details.className = 'latency-note';
      details.innerHTML = `<summary>Valeurs par mode à ${esc(latencyInfo.sampleRate)} kHz</summary>` + latencyInfo.modes.map((mode) => `<div>${esc(mode.label)} : ${esc(mode.samples)} samples</div>`).join('');
      n.querySelector('.latbox').append(details);
    }
  }
  const sel = n.querySelector('.own select');
  sel.innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  sel.value = currentLicenseStatus;
  sel.classList.toggle('set', sel.value !== 'unknown');
  sel.dataset.id = p.id;
  if(licenseDetails[p.id]&&['owned','subscription','former'].includes(sel.value)){
    const details=document.createElement('small');details.className='license-detail';details.textContent=`Licence importée : ${licenseDetails[p.id].name}`;n.querySelector('.own').after(details);
  }
  const controllerStatus = collectionControllerStatus(p.id, currentLicenseStatus, st.scope, CONTROLLER_MANIFEST);
  if (controllerStatus) {
    const indicator = document.createElement('div');
    indicator.className = `controller-status ${controllerStatus}`;
    indicator.textContent = `Controller · ${CONTROLLER_STATUS_LABELS[controllerStatus]}`;
    n.querySelector('.own').before(indicator);
    for (const option of controllerRequestOptions(p.id, currentLicenseStatus, st.scope, CONTROLLER_MANIFEST)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Exporter pour Controller · ${option.variant.pluginName} · ${option.variant.format} · ${option.variant.channelLayout}`;
      button.addEventListener('click', () => {
        const request = createControllerRequest(p.id, licenseStatus(p), st.scope, CONTROLLER_MANIFEST, option.variant);
        const url = URL.createObjectURL(new Blob([JSON.stringify(request, null, 2)], { type: 'application/json' }));
        const link = Object.assign(document.createElement('a'), { href: url, download: `${p.id}.controller-request.json` });
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      indicator.append(document.createElement('br'), button);
    }
  }
  const a = n.querySelector('.productlink');
  if (p.url) { a.href = p.url; a.textContent = 'Fiche constructeur ↗'; } else { a.removeAttribute('href'); a.textContent = 'Fiche non trouvée'; a.classList.add('none'); }
  n.querySelector('.footnote').textContent = hasDocumentedLatency(p) ? 'Latence : source constructeur' : (p.url ? 'Lue sur le site du fabricant' : '');
  n.querySelector('.footnote').title = p.latencyInfo?.url || (p.latency && p.vendor === 'Waves' ? META.latency.url : p.url || '');
  if (hasDocumentedLatency(p)) {
    const source = document.createElement('a');
    source.href = n.querySelector('.footnote').title;
    source.target = '_blank'; source.rel = 'noopener';
    source.textContent = 'Latence : source constructeur ↗';
    n.querySelector('.footnote').replaceChildren(source);
  }
  return n;
}

function render() {
  descriptionObserver.disconnect();
  refreshContextualFilters();
  const list = filtered();
  const latKey = (p) => { const l = lat(p, st.rate); return l?.samples ?? (l?.variants ? Math.min(...l.variants.map((v) => v.samples)) : 1e9); };
  const by = { az: (a, b) => a.name.localeCompare(b.name), brand: (a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name), images: (a, b) => (!!b.image - !!a.image) || a.name.localeCompare(b.name), latency: (a, b) => latKey(a) - latKey(b) || a.name.localeCompare(b.name) };
  list.sort(by[st.sort]);
  $('#matched').textContent = fmt(list.length);
  const activeScope = $('#scope').querySelector('.active');
  $('#resultScope').textContent = activeScope.textContent;
  const searchScope = $('#searchScope');
  searchScope.hidden = !st.q.trim() || !['owned', 'all'].includes(st.scope);
  searchScope.textContent = st.scope === 'owned' ? 'Étendre à toute la bibliothèque' : 'Revenir à Ma collection';
  $('#archiveHelp').hidden = st.scope !== 'archives';
  $('#hint').hidden = availabilityGroup(st.scope) === 'collection' || !!st.q.trim();
  const frag = document.createDocumentFragment();
  list.slice(0, shown).forEach((p) => frag.append(card(p)));
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Aucun plugin ne correspond à ces filtres.'; frag.append(e); }
  $('#cards').replaceChildren(frag);
  $('#more').hidden = list.length <= shown;
  const unmatched=$('#unmatchedCollection');unmatched.hidden=st.scope!=='owned'||!unmatchedLicenses.length;
  if(!unmatched.hidden){const groups=unmatchedLicenses.filter(l=>l.kind==='group').length,products=unmatchedLicenses.length-groups;
    $('#unmatchedSummary').textContent=[products?`${products} licences importées sans fiche correspondante`:'',groups?`${groups} groupes d’abonnement importés`:''].filter(Boolean).join(' · ');
    $('#unmatchedList').replaceChildren(...unmatchedLicenses.map(license=>{const li=document.createElement('li');li.textContent=`${license.publisher} — ${license.name} · ${STATUS[license.status]||'À vérifier'}${license.kind==='group'?' · Groupe de licences':''}`;return li;}));
  }
  document.querySelectorAll('.field').forEach((f) => { const s = f.querySelector('select'); if (s) f.classList.toggle('active', !!s.value && !['all', 'Tous', ''].includes(s.value) && s.id !== 'rate'); });
}

// ---------- Événements ----------
const rerender = () => { shown = PAGE; render(); };
let t;
$('#query').addEventListener('input', (e) => {
  st.q = e.target.value;
  clearTimeout(t);
  t = setTimeout(rerender, 120);
});
for (const k of ['zl', 'rate', 'links', 'visual', 'sort']) {
  $('#' + k).addEventListener('change', (e) => { st[k] = e.target.value; rerender(); });
}
document.addEventListener('click', (event) => document.querySelectorAll('.multi-select[open]').forEach((details) => { if (!details.contains(event.target)) details.open = false; }));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.multi-select[open]').forEach((details) => { details.open = false; details.querySelector('summary').focus(); }); });
function selectScope(scope) {
  clearTimeout(t);
  selections.catalogStatus = availabilityOnScopeChange(st.scope, scope, selections.catalogStatus, availabilityFilters, !!st.q.trim());
  st.scope = scope;
  for (const button of $('#scope').querySelectorAll('button')) {
    const active = button.dataset.scope === scope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  renderActiveFilters();
  rerender();
}
$('#scope').addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (button) selectScope(button.dataset.scope);
});
$('#searchScope').addEventListener('click', () => selectScope(st.scope === 'owned' ? 'all' : 'owned'));
$('#cards').addEventListener('change', (e) => {
  const s = e.target.closest('.own select'); if (!s) return;
  if (s.value === 'unknown') delete status[s.dataset.id]; else status[s.dataset.id] = s.value;
  s.classList.toggle('set', s.value !== 'unknown'); save();
  rerender();
});
$('#more').addEventListener('click', () => { shown += PAGE; render(); });
$('#reset').addEventListener('click', () => {
  clearTimeout(t);
  Object.assign(st, { q: '', zl: 'all', links: 'all', visual: 'all' });
  selections = defaultSelections(Object.keys(LBL.facets), st.scope);
  $('#query').value = '';
  $('#filterNotice').hidden = true;
  document.querySelectorAll('.multi-select').forEach((details) => {
    details.open = false;
    const search = details.querySelector('input[type="search"]');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
    details.querySelector('.multi-options').scrollTop = 0;
  });
  for (const k of ['zl', 'links', 'visual']) $('#' + k).value = 'all';
  filterControls.forEach((refresh) => refresh());
  renderActiveFilters(); rerender();
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportCollection(currentCollection(),DATA,PLANS), null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'pluginlib-ma-collection.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import').addEventListener('click', () => $('#importFile').click());
function showCollectionImport({ added, modified, unchanged, subscriptions, unmatchedAdded }) {
  const label = status => status === 'unknown' ? 'Aucun statut' : STATUS[status] || 'Non renseigné';
  $('#importUnchanged').textContent = `Plugins inchangés dans la collection et son historique · ${fmt(unchanged)}`;
  for (const [selector, changes] of [['#importAdded', added], ['#importModified', modified]]) {
    const list = $(selector);
    list.replaceChildren();
    for (const change of changes) {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = change.name;
      const notes = [`${label(change.before)} → ${label(change.after)}`];
      if (change.detailsChanged) notes.push('Informations de licence mises à jour');
      if (change.before === change.after && change.declaredBefore !== change.declaredAfter) {
        notes.push(`Déclaration de licence · ${label(change.declaredBefore)} → ${label(change.declaredAfter)}`);
      }
      item.append(name, ` · ${notes.join(' · ')}`);
      list.append(item);
    }
    list.hidden = !changes.length;
    list.previousElementSibling.hidden = !!changes.length;
  }
  const extra = subscriptions.map(plan => `${plan.vendor} ${plan.plan} · ${plan.status === 'active' ? 'Abonnement actif' : 'Abonnement non actif'}`);
  if (unmatchedAdded > 0) extra.push(`Licences sans fiche à ajouter · ${fmt(unmatchedAdded)}`);
  $('#importExtra').textContent = extra.join(' / ');
  $('#importExtra').hidden = !extra.length;
}

bindCollectionImport({
  input: $('#importFile'),
  dialog: $('#collectionImport'),
  prepare: source => previewCollectionImport(source, currentCollection(), DATA, PLANS),
  show: showCollectionImport,
  apply: next => {
    ({status,subscriptions,unmatchedLicenses,licenseDetails}=next);
    save(); renderSubscriptions(); render();
    const notice = $('#collectionNotice');
    notice.hidden = false;
    notice.textContent = 'Collection importée.';
  },
  onInvalid: () => {
    const notice = $('#collectionNotice');
    notice.hidden = false;
    notice.textContent = 'Fichier JSON de collection non reconnu.';
  }
});

load().catch((e) => { $('#cards').innerHTML = `<div class="empty">Impossible de charger les données : ${esc(e.message)}</div>`; });
