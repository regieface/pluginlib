// PluginLib — interface. Les données vivent dans data/*.json (mises à jour à la demande via GitHub Actions).
const moduleVersion = window.PL_V || 1;
const { productDescription } = await import(`./descriptions.mjs?v=${moduleVersion}`);
const { PLATFORMS, CATALOG_STATUSES, hasDocumentedLatency, formatPrice, isPriceStale } = await import(`./catalog.mjs?v=${moduleVersion}`);
const { emptySelection, defaultSelections, availabilityGroup, availabilityOnScopeChange, changeSelection, matchesPluginSelections, contextualCounts } = await import(`./filters.mjs?v=${moduleVersion}`);
const { normalizeClassification } = await import(`./classification.mjs?v=${moduleVersion}`);
const { FORMATS, TREATMENTS } = await import(`./treatment-taxonomy.mjs?v=${moduleVersion}`);
const { TREATMENT_OPTIONS, CLASSIFICATION_OPTIONS, classifiedTreatments, selectedTreatmentIds,
  navigationFacets, classificationSearchText, factStateLabel, treatmentDetails, sharedClassificationDetails, needsCatalogueReview } = await import(`./treatment-navigation.mjs?v=${moduleVersion}`);
const { SORT_RATE, currentLatency, documentedLatency, sortOptions, rankResults } = await import(`./result-sorting.mjs?v=${moduleVersion}`);
const { mountMultiSelect } = await import(`./multi-select.mjs?v=${moduleVersion}`);
const { RECORD_TYPES } = await import(`./record-types.mjs?v=${moduleVersion}`);
const { normalizeCollection, mergeCollection, collectionStatus, matchesCollectionScope, exportCollection, planFor, isPlanMember, subscriptionKey } = await import(`./collection.mjs?v=${moduleVersion}`);
const { bindCollectionImport, previewCollectionImport } = await import(`./collection-import.mjs?v=${moduleVersion}`);
const { CONTROLLER_STATUS_LABELS, collectionControllerStatus } = await import(`./controller-status.mjs?v=${moduleVersion}`);
const { buildComparison, comparisonScrollState, hasComparisonDifference } = await import(`./comparison.mjs?v=${moduleVersion}`);
const { controllerRequestOptions, createControllerRequest } = await import(`./controller-request.mjs?v=${moduleVersion}`);
const $ = (s) => document.querySelector(s);
const descriptionObserver=new ResizeObserver(entries=>{for(const {target:text} of entries){if(!text.isConnected)continue;const block=text.closest('.description'),toggle=block.querySelector('.description-toggle');toggle.hidden=!block.classList.contains('expanded')&&text.scrollHeight<=text.clientHeight+1;}});
const STATUS_KEY = 'pluginlib.status.v2';
const STATUS = { unknown: '—', owned: 'Licence perpétuelle', subscription: 'Abonnement actif', former: 'Ancien abonnement', trial: 'Démo', wishlist: 'Liste d’envies', not_owned: 'Non possédé' };
const PAGE = 30;

let DATA = [], META = null, LBL = null, status = {}, subscriptions = [], unmatchedLicenses = [], licenseDetails = {}, PLANS = [], CONTROLLER_MANIFEST = { schemaVersion: 1, links: [] }, shown = PAGE;
const st = { scope: 'owned', q: '', zl: false, missingVisual: false, needsReview: false, sort: 'name', direction: 1 };
let treatmentFacets = {};
const navigationSelections = scope => defaultSelections(
  ['treatment', 'classificationStatus', 'format', ...Object.keys(treatmentFacets)], scope);
let selections = navigationSelections(st.scope);
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
  const c = currentLatency(p, rate);
  if (c?.conflict || c?.uncertain) return { ...c, samples: null, zero: false, zeroMode: false };
  if (!c?.source && !c?.variants?.some(mode => mode.source)) return null;
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
    const classified = normalizeClassification(p);
    const presentation = productDescription(p,descriptions),summary=presentation.text;
    return { ...classified, summary, presentation, review: needsCatalogueReview(classified), _s: norm(`${p.name} ${(p.aliases || []).join(' ')} ${p.vendor} ${p.description} ${summary} ${classificationSearchText(classified)} ${LBL.categories[p.category] || ''}`) };
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
  const unclassified = DATA.filter(p => !classifiedTreatments(p).length).length;
  $('#classificationCoverage').textContent = `Catalogue : ${fmt(DATA.length - unclassified)} fiches classées · ${fmt(unclassified)} à classer.`;
  if (META.generatedAt) {
    const d = new Date(META.generatedAt);
    $('#headright').innerHTML = `Mise à jour du catalogue à la demande<br>Dernière : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  $('#sources').innerHTML = '<tr><th>Fabricant</th><th>État</th><th>Méthode</th><th>Plugins</th></tr>' +
    META.sources.map((s) => `<tr><td><a href="${esc(s.site)}" target="_blank" rel="noopener">${esc(s.vendor)}</a></td><td class="${s.ok ? 'ok' : 'ko'}">${s.ok ? 'À jour' : 'Échec' + (s.kept ? ' — données précédentes conservées' : '')}</td><td>${esc(s.via)}</td><td>${s.kept}</td></tr>`).join('') +
    `<tr><td><a href="${esc(META.latency.url || '#')}" target="_blank" rel="noopener">Latences Waves</a></td><td class="${META.latency.ok ? 'ok' : 'ko'}">${META.latency.ok ? 'À jour' : 'Échec'}</td><td>tableau officiel</td><td>${META.latency.rows ?? '—'}</td></tr>`;
}

function fillStatic() {
  treatmentFacets = navigationFacets(DATA);
  selections = navigationSelections(st.scope);
  mountTreatmentNavigation();
  addMulti('classificationStatus', 'Classification', 'Toutes les fiches', CLASSIFICATION_OPTIONS);
  addMulti('format', 'Format', 'Tous les formats', Object.entries(FORMATS));
  const makers = [...new Set(DATA.map(p => p.vendor))].sort((a, b) => a.localeCompare(b));
  addMulti('maker', 'Fabricants', 'Tous les fabricants', makers.map(value => [value, value]));
  addMulti('platform', 'Plateformes', 'Toutes les plateformes', [...Object.entries(PLATFORMS), ['unknown', 'Compatibilité à vérifier']]);
  addMulti('catalogStatus', 'Disponibilité', 'Tous les statuts', Object.entries(CATALOG_STATUSES));
  for (const [key, definition] of Object.entries(treatmentFacets)) {
    const field = document.createElement('div'); field.className = 'field';
    const label = document.createElement('div'); label.className = 'filter-label';
    label.textContent = definition.label;
    const root = document.createElement('div'); root.id = `facet-${key}`;
    field.append(label, root); $(key === 'treatmentFamily' ? '#familySlot' : '#facetFilters').append(field);
    if (key === 'treatmentFamily') mountFamilyButtons(root, definition);
    else addMulti(key, definition.label, 'Indifférent', definition.options, root);
  }
  renderActiveFilters();
}

function mountTreatmentNavigation() {
  const grid = $('#treatmentGrid');
  grid.replaceChildren(...TREATMENT_OPTIONS.map(([id, name]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline treatment-button';
    button.dataset.treatment = id;
    button.textContent = name;
    button.addEventListener('click', () => selectTreatment(id));
    return button;
  }));
  refreshTreatmentNavigation();
}

function refreshTreatmentNavigation() {
  const [id] = selections.treatment.include;
  $('#resetTreatment').disabled = !id && !Object.keys(treatmentFacets).some(key =>
    selections[key].include.length || selections[key].exclude.length);
  for (const button of $('#treatmentGrid').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.treatment === id));
  }
}

function selectTreatment(id) {
  const [previous] = selections.treatment.include;
  if (id && previous === id) return;
  for (const [key, definition] of Object.entries(treatmentFacets)) {
    if (!id || key === 'treatmentFamily' || !definition.for.includes(id)) selections[key] = emptySelection();
  }
  selections.treatment = { include: id ? [id] : [], exclude: [] };
  refreshTreatmentNavigation();
  renderActiveFilters();
  rerender();
}

$('#resetTreatment').addEventListener('click', () => {
  const [previous] = selections.treatment.include;
  selectTreatment();
  [...$('#treatmentGrid').querySelectorAll('button')].find(button => button.dataset.treatment === previous)?.focus();
});

function mountFamilyButtons(root, { label, options }) {
  const key = 'treatmentFamily';
  root.className = 'family-buttons';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const rows = options.map(([value, contextualLabel]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'outline family-button';
    button.hidden = true;
    const [type, family] = value.split('/');
    const name = TREATMENTS[type].families[family];
    button.textContent = name;
    button.setAttribute('aria-label', contextualLabel);
    button.addEventListener('click', () => {
      const selection = selections[key];
      selections[key] = changeSelection(selection, value, 'include', !selection.include.includes(value));
      renderActiveFilters();
      rerender();
    });
    return { value, name, button };
  });
  root.replaceChildren(...rows.map(({ button }) => button));
  filterChoices.set(key, { label, options, root });
  filterControls.set(key, (context = {}) => {
    for (const { value, name, button } of rows) {
      if (context.allowed) button.hidden = !context.allowed(value);
      if (context.counts) button.textContent = `${name} (${context.counts.get(value) || 0})`;
      button.setAttribute('aria-pressed', String(selections[key].include.includes(value)));
    }
  });
}

function addMulti(key, label, emptyLabel, options, root = $('#' + key)) {
  filterChoices.set(key, { label, options, root });
  filterControls.set(key, mountMultiSelect(root, { label, emptyLabel, options, getSelection: () => selections[key], onChange: (next) => {
    selections[key] = next;
    renderActiveFilters(); rerender();
  } }));
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
    if (st.zl && documentedLatency(p)?.key !== 0) return false;
    if (st.missingVisual && p.image) return false;
    if (st.needsReview && !p.review) return false;
    return true;
  });
}

function refreshContextualFilters() {
  if (!filterChoices.size) return;
  const advancedActive = [...filterChoices].filter(([key]) =>
    !['platform', 'catalogStatus', 'treatmentFamily', 'classificationStatus'].includes(key) &&
    (selections[key].include.length || selections[key].exclude.length)).length;
  $('#advancedCount').hidden = !advancedActive;
  $('#advancedCount').textContent = advancedActive ? `${advancedActive} actif${advancedActive === 1 ? '' : 's'}` : '';
  const candidates = filtered(true);
  const types = selectedTreatmentIds(selections.treatment, true);
  let outsideSelection = false;
  for (const [key, { root }] of filterChoices) {
    const definition = treatmentFacets[key];
    const applicable = !definition || definition.for.some(type => types.includes(type));
    const { include, exclude } = selections[key];
    const active = include.length || exclude.length;
    const allowed = value => key !== 'treatmentFamily' || types.includes(value.split('/')[0]);
    if (active && definition && (!applicable || [...include, ...exclude].some(value => !allowed(value)))) outsideSelection = true;
    const counts = applicable || active ? contextualCounts(candidates, selections, key, treatmentFacets) : new Map();
    const showEmpty = ['classificationStatus', 'treatmentFamily'].includes(key);
    const hidden = !!definition && !active && (!applicable || (!showEmpty && counts.size === 0));
    root.closest('.field').hidden = hidden;
    if (hidden && key !== 'treatmentFamily') root.querySelector('details').open = false;
    filterControls.get(key)({ counts, allowed, showEmpty });
  }
  const notice = $('#filterNotice');
  notice.hidden = !outsideSelection;
  notice.textContent = outsideSelection ? 'Certains critères actifs concernent un autre traitement. Ils restent modifiables dans les filtres actifs.' : '';
}

function latCell(p, rate) {
  const l = lat(p, rate);
  if (!l) return `<div class="lat"><span>${rate} kHz</span><b>—</b><small>non publiée</small></div>`;
  if (l.samples != null && (!l.unit || l.unit === 'samples') && !Object.keys(l.conditions || {}).length) return `<div class="lat ${l.zero ? 'zero' : ''}"><span>${rate} kHz</span><b>${l.samples} sample${l.samples > 1 ? 's' : ''}</b><small>${ms(l.samples, rate)} ms</small></div>`;
  if (l.variants?.length) return `<div class="lat ${l.zeroMode ? 'zero' : ''}"><span>${rate} kHz · selon mode</span>${l.variants.map((v) => `<small>${esc(v.label)} : <b style="display:inline">${v.samples}</b></small>`).join('')}</div>`;
  return `<div class="lat"><span>${rate} kHz</span><small title="${esc(l.note)}">${esc(l.note || 'Latence selon les conditions').slice(0, 80)}</small></div>`;
}

function fillPluginArt(art, p, comparison = false) {
  const img = art.querySelector('img');
  art.querySelector('.fallback b').textContent = p.vendor.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  art.querySelector('.fallback span').textContent = comparison ? LBL.categories[p.category] || '' :
    classifiedTreatments(p).map(({ type }) => TREATMENTS[type].label).join(' · ') || 'À classer';
  if (!p.image) { img.remove(); return; }
  img.onload = () => art.classList.add('has-image');
  img.onerror = () => { art.classList.remove('has-image'); img.remove(); };
  img.alt = p.name;
  img.src = p.image;
}

function factBadge(label, fact, classes = '', showState = false) {
  const state = factStateLabel(fact);
  const proof = fact.evidence?.find(evidence => /^https?:\/\//i.test(evidence.url || ''));
  const scope = Object.entries(fact.conditions || {}).map(([key, value]) =>
    key === 'sampleRateKHz' ? `${value} kHz` : key === 'conditional' && value && !fact.conditions.mode ? 'Selon les conditions' :
      typeof value === 'boolean' ? '' : value).filter(Boolean).join(' · ');
  const text = [label, showState ? state : '', scope].filter(Boolean).join(' · ');
  const attributes = `class="badge ${classes}" title="${esc([state, proof?.excerpt].filter(Boolean).join(' · '))}"`;
  return proof ? `<a ${attributes} href="${esc(proof.url)}" target="_blank" rel="noopener">${esc(text)} ↗</a>` :
    `<span ${attributes}>${esc(text)}</span>`;
}

function card(p, editable = false) {
  const n = $('#tpl').content.cloneNode(true);
  const currentLicenseStatus = licenseStatus(p);
  n.querySelector('.card').classList.toggle('licensed', ['owned', 'subscription'].includes(currentLicenseStatus));
  fillPluginArt(n.querySelector('.art'), p);
  n.querySelector('.ribbon').textContent = documentedLatency(p)?.key === 0 ? `Zero latency · ${SORT_RATE} kHz` : '';
  n.querySelector('.maker').textContent = p.vendor;
  n.querySelector('.plugin').textContent = p.name;
  const description=n.querySelector('.description');
  const text=document.createElement('p');text.className='description-text';text.id=`description-${editable ? 'fiche-' : 'comparison-'}${p.id}`;text.textContent=p.summary;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='description-toggle';toggle.textContent='Lire la suite';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',text.id);toggle.hidden=true;
  toggle.addEventListener('click',()=>{const expanded=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Réduire':'Lire la suite';description.classList.toggle('expanded',expanded);});
  description.append(text,toggle);
  if(p.presentation.url){const source=document.createElement('a');source.className='description-source';source.href=p.presentation.url;source.target='_blank';source.rel='noopener';source.textContent=p.presentation.label+' ↗';description.append(source);}
  descriptionObserver.observe(text);
  const tagLabel = (tag) => { const [f, v] = tag.split(':'); return f === 'opt' ? LBL.common[v] : LBL.facets[f]?.values[v]; };
  const tags = p.tags.map((id) => ({ id, label: tagLabel(id) })).filter((t) => t.label);
  const treatments = p.classification?.treatments || [];
  const treatmentBadges = classifiedTreatments(p).map(fact => factBadge(TREATMENTS[fact.type].label, fact, 'fam'));
  const formatBadges = (p.classification?.formats || []).filter(fact => fact.state === 'present')
    .map(fact => factBadge(FORMATS[fact.id], fact));
  const discontinuedBadge = p.catalogStatus === 'discontinued'
    ? `<span class="badge discontinued"${p.statusEvidence?.url ? ` title="${esc(p.statusEvidence.url)}"` : ''}>${CATALOG_STATUSES.discontinued}</span>`
    : '';
  const badges = n.querySelector('.badges');
  badges.innerHTML = discontinuedBadge +
    (treatmentBadges.join('') || '<span class="badge unknown">À classer</span>') + formatBadges.join('');
  const shared = sharedClassificationDetails(p);
  if (treatments.length || tags.length || shared.length || p.classification?.formats?.some(fact => fact.state !== 'present')) {
    const technical = document.createElement('details'); technical.className = 'technical-details';
    const rows = details => `<ul>${details.map(({ label, value, fact }) =>
      `<li>${esc(label)} ${factBadge(value || factStateLabel(fact), fact, '', Boolean(value))}</li>`).join('')}</ul>`;
    technical.innerHTML = '<summary>Caractéristiques</summary>' + treatments.map(treatment => `<section>
      <h3>${esc(TREATMENTS[treatment.type].label)} <small>${esc(factStateLabel(treatment))}</small></h3>
      ${rows(treatmentDetails(p, treatment))}
    </section>`).join('') +
      (shared.length ? `<section><h3>Caractéristiques communes</h3>${rows(shared)}</section>` : '') +
      (p.classification?.formats || []).filter(fact => fact.state !== 'present')
        .map(fact => factBadge(FORMATS[fact.id], fact, '', true)).join('') +
      (tags.length ? `<section><h3>Critères historiques</h3><div class="badges">${tags.map(({id,label}) => {
        const proof = p.featureEvidence?.[id];
        return factBadge(label, { state: 'present', confidence: ['reviewed-source', 'latency-table'].includes(proof?.method)
          ? 'verified' : 'reported', evidence: proof ? [proof] : [] });
      }).join('')}</div></section>` : '');
    badges.after(technical);
  }
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
  sel.disabled = !editable;
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

const comparisonSelection = new Map();
const comparisonDialog = $('#comparisonDialog');
const comparisonViewport = $('#comparisonTable');

function updateComparisonScroll() {
  const { left, right } = comparisonScrollState(comparisonViewport);
  $('#comparisonScroll').hidden = !left && !right;
  $('#comparisonScrollLeft').disabled = !left;
  $('#comparisonScrollRight').disabled = !right;
  const direction = left && right ? 'à gauche et à droite' : left ? 'à gauche' : 'à droite';
  $('#comparisonScrollHint').textContent = `Colonnes hors écran ${direction}`;
}

comparisonViewport.addEventListener('scroll', updateComparisonScroll, { passive: true });
new ResizeObserver(updateComparisonScroll).observe(comparisonViewport);
for (const [id, direction] of [['comparisonScrollLeft', -1], ['comparisonScrollRight', 1]]) {
  $(`#${id}`).addEventListener('click', () => {
    const column = comparisonViewport.querySelector('.comparison-plugin-heading');
    if (column) comparisonViewport.scrollBy({ left: direction * column.getBoundingClientRect().width });
  });
}
const qualityLabels = {
  verified: 'Vérifié', conditional: 'Selon le mode ou les conditions',
  pending: 'À confirmer', collection: 'Ma collection'
};

function renderComparisonSelection() {
  const count = comparisonSelection.size;
  $('#comparisonBar').hidden = !count;
  $('#openComparison').disabled = count < 2;
  $('#comparisonSelection').innerHTML = [...comparisonSelection.values()].map(p =>
    `<li><button type="button" class="outline" data-remove="${esc(p.id)}" aria-label="Retirer ${esc(p.name)}">${esc(p.name)} · ×</button></li>`
  ).join('');
  for (const button of $('#cards').querySelectorAll('.compare-plugin')) {
    button.setAttribute('aria-pressed', String(comparisonSelection.has(button.dataset.pluginId)));
  }
}

function comparisonCell(cell) {
  return `<td><ul>${cell.map(({ value, quality, source, context }) => {
    const sourceLink = /^https?:\/\//i.test(source || '') ? ` · <a href="${esc(source)}" target="_blank" rel="noopener" title="${esc(context)}">Source ↗</a>` : '';
    const qualityLabel = qualityLabels[quality];
    return `<li>${esc(value)}${qualityLabel || sourceLink ? `<small data-quality="${quality}">${qualityLabel || ''}${sourceLink}</small>` : ''}</li>`;
  }).join('')}</ul></td>`;
}

function renderComparison() {
  const plugins = [...comparisonSelection.values()];
  const sections = buildComparison(plugins, LBL, licenseStatus, STATUS);
  const differencesOnly = $('#comparisonDifferences').checked;
  const container = comparisonViewport;
  const { scrollLeft, scrollTop } = container;
  const headers = plugins.map(p => `<th scope="col" class="comparison-plugin-heading">
    <div class="art"><div class="fallback"><b></b><span></span></div><img referrerpolicy="no-referrer" alt=""></div>
    ${esc(p.name)}<small>${esc(p.vendor)}</small>
    <div class="actions">
      <button type="button" class="outline" data-detail="${esc(p.id)}">Fiche PluginLib</button>
      <button type="button" class="outline" data-remove="${esc(p.id)}" aria-label="Retirer ${esc(p.name)}">Retirer</button>
    </div></th>`).join('');
  const bodies = sections.map(({ title, rows }) => {
    const visible = differencesOnly ? rows.filter(hasComparisonDifference) : rows;
    if (!visible.length) return '';
    return `<tbody><tr class="comparison-section"><th scope="rowgroup" class="comparison-criterion">${esc(title)}</th><td colspan="${plugins.length}"></td></tr>
      ${visible.map(({ label, cells }) => `<tr><th scope="row" class="comparison-criterion">${esc(label)}</th>${cells.map(comparisonCell).join('')}</tr>`).join('')}</tbody>`;
  }).join('');
  const empty = `<tbody><tr><td colspan="${plugins.length + 1}">Aucune différence documentée.</td></tr></tbody>`;
  container.innerHTML = `<table aria-labelledby="comparisonTitle" style="--plugin-count: ${plugins.length}"><colgroup><col class="comparison-criterion-column"><col span="${plugins.length}"></colgroup><thead><tr><th scope="col" class="comparison-criterion">Critère</th>${headers}</tr></thead>${bodies || empty}</table>`;
  container.querySelectorAll('.art').forEach((art, index) => fillPluginArt(art, plugins[index], true));
  container.scrollLeft = scrollLeft;
  container.scrollTop = scrollTop;
  updateComparisonScroll();
}

function showComparisonTable() {
  $('#comparisonDetail').hidden = true;
  clearPluginDetail($('#comparisonDetail'));
  $('#comparisonBack').hidden = true;
  $('#comparisonTable').hidden = false;
  $('#comparisonDifferencesLabel').hidden = false;
  updateComparisonScroll();
}

function removeComparisonPlugin(id) {
  const button = [...$('#cards').querySelectorAll('.compare-plugin')].find(control => control.dataset.pluginId === id);
  comparisonSelection.delete(id);
  renderComparisonSelection();
  if (!comparisonDialog.open) {
    ($('#comparisonSelection button') || button || $('#query')).focus();
    return;
  }
  if (comparisonSelection.size < 2) {
    comparisonDialog.close();
    ($('#comparisonSelection button') || button || $('#query')).focus();
  } else {
    renderComparison();
    $('#comparisonTable').focus();
  }
}

$('#comparisonSelection').addEventListener('click', event => {
  const button = event.target.closest('[data-remove]');
  if (button) removeComparisonPlugin(button.dataset.remove);
});
$('#clearComparison').addEventListener('click', () => {
  comparisonSelection.clear();
  renderComparisonSelection();
  $('#query').focus();
});
$('#openComparison').addEventListener('click', () => {
  if (comparisonSelection.size < 2) return;
  showComparisonTable();
  renderComparison();
  comparisonDialog.showModal();
  updateComparisonScroll();
});
$('#comparisonDifferences').addEventListener('change', renderComparison);
$('#comparisonTable').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.remove) removeComparisonPlugin(button.dataset.remove);
  const plugin = comparisonSelection.get(button?.dataset.detail);
  if (!plugin) return;
  const detail = $('#comparisonDetail');
  clearPluginDetail(detail);
  detail.append(card(plugin));
  detail.hidden = false;
  $('#comparisonTable').hidden = true;
  updateComparisonScroll();
  $('#comparisonDifferencesLabel').hidden = true;
  const back = $('#comparisonBack');
  back.hidden = false;
  back.focus();
});
$('#comparisonBack').addEventListener('click', () => {
  showComparisonTable();
  $('#comparisonTable').focus();
});

function clearPluginDetail(root) {
  const description = root.querySelector('.description-text');
  if (description) descriptionObserver.unobserve(description);
  root.replaceChildren();
}

$('#pluginDetail').addEventListener('close', () => clearPluginDetail($('#pluginDetailContent')));
comparisonDialog.addEventListener('close', () => clearPluginDetail($('#comparisonDetail')));

const RESULT_VIEW_KEY = 'pluginlib.result-view.v1';
function setResultView(view, remember = false) {
  const grid = view === 'grid';
  $('#cards').dataset.view = grid ? 'grid' : 'list';
  $('#viewList').setAttribute('aria-pressed', String(!grid));
  $('#viewGrid').setAttribute('aria-pressed', String(grid));
  if (remember) {
    try { localStorage.setItem(RESULT_VIEW_KEY, grid ? 'grid' : 'list'); } catch { /* stockage indisponible */ }
  }
}
let storedResultView;
try { storedResultView = localStorage.getItem(RESULT_VIEW_KEY); } catch { /* stockage indisponible */ }
setResultView(storedResultView);
$('#viewList').addEventListener('click', () => setResultView('list', true));
$('#viewGrid').addEventListener('click', () => setResultView('grid', true));

function resultRow({ plugin, value }) {
  const row = $('#resultTpl').content.cloneNode(true);
  row.querySelector('.result-row').classList.toggle('licensed', ['owned', 'subscription'].includes(licenseStatus(plugin)));
  fillPluginArt(row.querySelector('.art'), plugin);
  row.querySelector('.plugin').textContent = plugin.name;
  row.querySelector('.maker').textContent = plugin.vendor;
  const metric = row.querySelector('.result-value');
  metric.hidden = st.sort === 'name';
  if (value?.url && /^https?:\/\//i.test(value.url)) {
    const source = document.createElement('a');
    source.href = value.url;
    source.target = '_blank';
    source.rel = 'noopener';
    source.textContent = value.text;
    metric.append(source);
  } else metric.textContent = value?.text || '—';
  metric.title = value?.title || 'Valeur comparable non renseignée';
  const open = row.querySelector('.open-plugin');
  open.setAttribute('aria-label', `Ouvrir la fiche ${plugin.name}`);
  open.addEventListener('click', () => {
    const detail = $('#pluginDetailContent');
    clearPluginDetail(detail);
    detail.append(card(plugin, true));
    $('#pluginDetail').showModal();
  });
  const compare = row.querySelector('.compare-plugin');
  compare.dataset.pluginId = plugin.id;
  compare.setAttribute('aria-label', `Comparer ${plugin.name}`);
  compare.setAttribute('aria-pressed', String(comparisonSelection.has(plugin.id)));
  compare.addEventListener('click', () => {
    if (comparisonSelection.has(plugin.id)) comparisonSelection.delete(plugin.id);
    else comparisonSelection.set(plugin.id, plugin);
    renderComparisonSelection();
  });
  return row;
}

function refreshSorting(plugins) {
  const [type] = selections.treatment.include;
  const now = Date.now();
  const options = sortOptions(type, plugins, now);
  if (!options.some(([id, , enabled]) => id === st.sort && enabled)) st.sort = 'name';
  $('#sort').replaceChildren(...options.map(([id, label, enabled]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = enabled || id === 'cpu' ? label : `${label} · données insuffisantes`;
    option.disabled = !enabled;
    return option;
  }));
  $('#sort').value = st.sort;
  const direction = $('#sortDirection');
  direction.textContent = st.direction === 1 ? '↑' : '↓';
  direction.setAttribute('aria-label', `Tri ${st.direction === 1 ? 'croissant' : 'décroissant'}. Inverser le sens du tri.`);
  const basis = {
    latency: `${SORT_RATE} kHz · valeurs globales en échantillons, avec source`,
    attack: 'Minimum des plages documentées en millisecondes',
    release: 'Minimum des plages documentées en millisecondes',
    price: 'Achat du plugin · prix normal récent en euros, hors abonnement'
  }[st.sort];
  $('#sortBasis').hidden = !basis;
  $('#sortBasis').textContent = basis || '';
  return rankResults(plugins, st.sort, st.direction, type, now);
}

function render() {
  refreshContextualFilters();
  const list = refreshSorting(filtered());
  $('#matched').textContent = fmt(list.length);
  const activeScope = $('#scope').querySelector('.active');
  $('#resultScope').textContent = activeScope.textContent;
  const searchScope = $('#searchScope');
  searchScope.hidden = !st.q.trim() || !['owned', 'all'].includes(st.scope);
  searchScope.textContent = st.scope === 'owned' ? 'Étendre à toute la bibliothèque' : 'Revenir à Ma collection';
  $('#archiveHelp').hidden = st.scope !== 'archives';
  $('#hint').hidden = availabilityGroup(st.scope) === 'collection' || !!st.q.trim();
  const frag = document.createDocumentFragment();
  list.slice(0, shown).forEach(result => frag.append(resultRow(result)));
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Aucun plugin ne correspond à ces filtres.'; frag.append(e); }
  $('#cards').replaceChildren(frag);
  $('#more').hidden = list.length <= shown;
  const unmatched=$('#unmatchedCollection');unmatched.hidden=st.scope!=='owned'||!unmatchedLicenses.length;
  if(!unmatched.hidden){const groups=unmatchedLicenses.filter(l=>l.kind==='group').length,products=unmatchedLicenses.length-groups;
    $('#unmatchedSummary').textContent=[products?`${products} licences importées sans fiche correspondante`:'',groups?`${groups} groupes d’abonnement importés`:''].filter(Boolean).join(' · ');
    $('#unmatchedList').replaceChildren(...unmatchedLicenses.map(license=>{const li=document.createElement('li');li.textContent=`${license.publisher} — ${license.name} · ${STATUS[license.status]||'À vérifier'}${license.kind==='group'?' · Groupe de licences':''}`;return li;}));
  }
}

// ---------- Événements ----------
const rerender = () => { shown = PAGE; render(); };
let t;
$('#query').addEventListener('input', (e) => {
  st.q = e.target.value;
  clearTimeout(t);
  t = setTimeout(rerender, 120);
});
for (const key of ['zl', 'missingVisual', 'needsReview']) {
  $('#' + key).addEventListener('change', event => { st[key] = event.target.checked; rerender(); });
}
$('#sort').addEventListener('change', event => { st.sort = event.target.value; rerender(); });
$('#sortDirection').addEventListener('click', () => { st.direction *= -1; rerender(); });
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
$('#pluginDetailContent').addEventListener('change', (e) => {
  const s = e.target.closest('.own select'); if (!s) return;
  if (s.value === 'unknown') delete status[s.dataset.id]; else status[s.dataset.id] = s.value;
  save();
  const plugin = DATA.find(entry => entry.id === s.dataset.id);
  if (plugin) {
    const detail = $('#pluginDetailContent');
    clearPluginDetail(detail);
    detail.append(card(plugin, true));
    detail.querySelector('.own select').focus();
  }
  rerender();
});
$('#more').addEventListener('click', () => { shown += PAGE; render(); });
$('#reset').addEventListener('click', () => {
  clearTimeout(t);
  Object.assign(st, { q: '', zl: false, missingVisual: false, needsReview: false, sort: 'name', direction: 1 });
  selections = navigationSelections(st.scope);
  $('#query').value = '';
  $('#filterNotice').hidden = true;
  document.querySelectorAll('.multi-select').forEach((details) => {
    details.open = false;
    const search = details.querySelector('input[type="search"]');
    if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
    details.querySelector('.multi-options').scrollTop = 0;
  });
  for (const key of ['zl', 'missingVisual', 'needsReview']) $('#' + key).checked = false;
  refreshTreatmentNavigation();
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
