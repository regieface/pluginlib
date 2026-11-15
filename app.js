// PluginLib — interface. Les données vivent dans data/*.json (mises à jour chaque nuit par GitHub Actions).
import { shortDescription } from './descriptions.mjs';
const $ = (s) => document.querySelector(s);
const STATUS_KEY = 'pluginlib.status.v2';
const STATUS = { unknown: '—', owned: 'Licence perpétuelle', subscription: 'Abonnement actif', former: 'Ancien abonnement', trial: 'Démo', wishlist: 'Liste d’envies', not_owned: 'Non possédé' };
const PAGE = 30;

let DATA = [], META = null, LBL = null, status = {}, shown = PAGE;
const st = { scope: 'all', q: '', family: '', maker: '', c1: '', c2: '', c3: '', option: '', zl: 'all', rate: '96', links: 'all', visual: 'all', sort: 'az' };

// Collection : statut par plugin (reprise de l'ancien format « étoile » si présent)
try {
  status = JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {};
  const old = JSON.parse(localStorage.getItem('pluginlib.owned.v1') || '[]');
  old.forEach((id) => { if (!status[id]) status[id] = 'owned'; });
} catch { status = {}; }
const save = () => { try { localStorage.setItem(STATUS_KEY, JSON.stringify(status)); } catch { /* stockage indisponible */ } };

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
  const [d, m] = await Promise.all([
    fetch('data/plugins.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'no-cache' }).then((r) => r.json())
  ]);
  META = m; LBL = m.labels;
  DATA = d.plugins.map((p) => {
    const summary = shortDescription(p);
    return { ...p, summary, _s: norm(`${p.name} ${p.vendor} ${p.description} ${summary} ${LBL.categories[p.category] || ''}`) };
  });
  stats(); fillStatic(); render();
}

function stats() {
  $('#total').textContent = fmt(DATA.length);
  $('#makers').textContent = fmt(new Set(DATA.map((p) => p.vendor)).size);
  $('#latstat').textContent = fmt(DATA.filter((p) => p.latency).length);
  $('#linkstat').textContent = fmt(DATA.filter((p) => p.url).length);
  if (META.generatedAt) {
    const d = new Date(META.generatedAt);
    $('#headright').innerHTML = `Mise à jour automatique chaque nuit<br>Dernière : ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  $('#sources').innerHTML = '<tr><th>Fabricant</th><th>État</th><th>Méthode</th><th>Plugins</th></tr>' +
    META.sources.map((s) => `<tr><td><a href="${esc(s.site)}" target="_blank" rel="noopener">${esc(s.vendor)}</a></td><td class="${s.ok ? 'ok' : 'ko'}">${s.ok ? 'À jour' : 'Échec' + (s.kept ? ' — données précédentes conservées' : '')}</td><td>${esc(s.via)}</td><td>${s.kept}</td></tr>`).join('') +
    `<tr><td><a href="${esc(META.latency.url || '#')}" target="_blank" rel="noopener">Latences Waves</a></td><td class="${META.latency.ok ? 'ok' : 'ko'}">${META.latency.ok ? 'À jour' : 'Échec'}</td><td>tableau officiel</td><td>${META.latency.rows ?? '—'}</td></tr>`;
}

const opt = (v, l, n) => `<option value="${esc(v)}">${esc(l)}${n != null ? ` (${n})` : ''}</option>`;

function fillStatic() {
  const fam = {}; DATA.forEach((p) => { fam[p.category] = (fam[p.category] || 0) + 1; });
  $('#family').innerHTML = opt('', 'Toutes les familles') + Object.entries(LBL.categories).filter(([id]) => fam[id]).sort((a, b) => a[1].localeCompare(b[1])).map(([id, l]) => opt(id, l, fam[id])).join('');
  const mk = {}; DATA.forEach((p) => { mk[p.vendor] = (mk[p.vendor] || 0) + 1; });
  $('#maker').innerHTML = opt('', 'Tous les fabricants') + Object.keys(mk).sort((a, b) => a.localeCompare(b)).map((v) => opt(v, v, mk[v])).join('');
  $('#option').innerHTML = opt('', 'Toutes') + Object.entries(LBL.common).map(([k, l]) => opt(`opt:${k}`, l)).join('');
  contextual();
}

// Critères contextuels : ils changent selon la famille choisie
function contextual() {
  const facets = st.family ? Object.entries(LBL.facets).filter(([, f]) => f.for.includes(st.family)) : [];
  const pool = DATA.filter((p) => p.category === st.family);
  ['c1', 'c2', 'c3'].forEach((k, i) => {
    const sel = $('#' + k), lab = $('#label' + (i + 1));
    const f = facets[i];
    st[k] = '';
    if (!f) {
      lab.textContent = st.family ? '—' : `Critère ${i + 1}`;
      sel.innerHTML = opt('', st.family ? 'Sans objet pour cette famille' : 'Choisis une famille'); sel.disabled = true; return;
    }
    const [fid, def] = f;
    lab.textContent = def.label;
    const vals = Object.entries(def.values).map(([v, l]) => [`${fid}:${v}`, l, pool.filter((p) => p.tags.includes(`${fid}:${v}`)).length]).filter((x) => x[2]);
    sel.innerHTML = opt('', 'Tous') + vals.map(([v, l, n]) => opt(v, l, n)).join('');
    sel.disabled = !vals.length;
  });
}

// ---------- Filtrage ----------
function filtered() {
  const terms = norm(st.q).split(/\s+/).filter(Boolean);
  return DATA.filter((p) => {
    const s = status[p.id] || 'unknown';
    if (st.scope === 'owned' && !['owned', 'subscription'].includes(s)) return false;
    if (st.scope === 'wishlist' && s !== 'wishlist') return false;
    if (st.scope === 'discover' && ['owned', 'subscription', 'former'].includes(s)) return false;
    if (terms.length && !terms.every((t) => p._s.includes(t))) return false;
    if (st.family && p.category !== st.family) return false;
    if (st.maker && p.vendor !== st.maker) return false;
    for (const k of ['c1', 'c2', 'c3', 'option']) if (st[k] && !p.tags.includes(st[k])) return false;
    const l = lat(p, st.rate);
    if (st.zl === 'zero' && !(l && l.zero)) return false;
    if (st.zl === 'zeromode' && !(l && (l.zero || l.zeroMode))) return false;
    if (st.zl === 'announced' && !p.tags.includes('opt:zl') && !(l && l.zero)) return false;
    if (st.zl === 'known' && !l) return false;
    if (st.links === 'yes' && !p.url) return false;
    if (st.links === 'no' && p.url) return false;
    if (st.visual === 'yes' && !p.image) return false;
    if (st.visual === 'no' && p.image) return false;
    return true;
  });
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
  const img = n.querySelector('img');
  n.querySelector('.fallback b').textContent = p.vendor.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  n.querySelector('.fallback span').textContent = LBL.categories[p.category] || '';
  if (p.image) { img.src = p.image; img.alt = p.name; img.onerror = () => img.remove(); } else img.remove();
  const l = lat(p, st.rate);
  n.querySelector('.ribbon').textContent = l?.zero ? `Zero latency · ${st.rate} kHz` : l?.zeroMode ? `ZL selon mode · ${st.rate} kHz` : '';
  n.querySelector('.maker').textContent = p.vendor;
  n.querySelector('.plugin').textContent = p.name;
  n.querySelector('.description').textContent = p.summary;
  const tags = p.tags.map((t) => { const [f, v] = t.split(':'); return f === 'opt' ? LBL.common[v] : LBL.facets[f]?.values[v]; }).filter(Boolean);
  n.querySelector('.badges').innerHTML = `<span class="badge fam">${esc(LBL.categories[p.category] || p.category)}</span>` + tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('') + (p.classifiedBy === 'manuel' ? '<span class="badge ok">Classement vérifié</span>' : '');
  n.querySelector('.latbox').innerHTML = p.latency ? latCell(p, '48') + latCell(p, '96') : '';
  const sel = n.querySelector('.own select');
  sel.innerHTML = Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  sel.value = status[p.id] || 'unknown';
  sel.classList.toggle('set', sel.value !== 'unknown');
  sel.dataset.id = p.id;
  const a = n.querySelector('.productlink');
  if (p.url) { a.href = p.url; a.textContent = 'Fiche constructeur ↗'; } else { a.removeAttribute('href'); a.textContent = 'Fiche non trouvée'; a.classList.add('none'); }
  n.querySelector('.footnote').textContent = p.latency ? 'Latence : tableau officiel Waves' : (p.url ? 'Lue sur le site du fabricant' : '');
  return n;
}

function render() {
  const list = filtered();
  const latKey = (p) => { const l = lat(p, st.rate); return l?.samples ?? (l?.variants ? Math.min(...l.variants.map((v) => v.samples)) : 1e9); };
  const by = { az: (a, b) => a.name.localeCompare(b.name), brand: (a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name), images: (a, b) => (!!b.image - !!a.image) || a.name.localeCompare(b.name), latency: (a, b) => latKey(a) - latKey(b) || a.name.localeCompare(b.name) };
  list.sort(by[st.sort]);
  $('#matched').textContent = fmt(list.length);
  const frag = document.createDocumentFragment();
  list.slice(0, shown).forEach((p) => frag.append(card(p)));
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Aucun plugin ne correspond à ces filtres.'; frag.append(e); }
  $('#cards').replaceChildren(frag);
  $('#more').hidden = list.length <= shown;
  document.querySelectorAll('.field').forEach((f) => { const s = f.querySelector('select'); f.classList.toggle('active', !!s.value && !['all', 'Tous', ''].includes(s.value) && s.id !== 'rate'); });
}

// ---------- Événements ----------
const rerender = () => { shown = PAGE; render(); };
let t;
$('#query').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value; rerender(); }, 120); });
for (const k of ['family', 'maker', 'c1', 'c2', 'c3', 'option', 'zl', 'rate', 'links', 'visual', 'sort']) {
  $('#' + k).addEventListener('change', (e) => { st[k] = e.target.value; if (k === 'family') contextual(); rerender(); });
}
$('#scope').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('#scope').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
  st.scope = b.dataset.scope; rerender();
});
$('#cards').addEventListener('change', (e) => {
  const s = e.target.closest('.own select'); if (!s) return;
  if (s.value === 'unknown') delete status[s.dataset.id]; else status[s.dataset.id] = s.value;
  s.classList.toggle('set', s.value !== 'unknown'); save();
});
$('#more').addEventListener('click', () => { shown += PAGE; render(); });
$('#reset').addEventListener('click', () => {
  Object.assign(st, { q: '', family: '', maker: '', option: '', zl: 'all', links: 'all', visual: 'all' });
  $('#query').value = '';
  for (const k of ['family', 'maker', 'option']) $('#' + k).value = '';
  for (const k of ['zl', 'links', 'visual']) $('#' + k).value = 'all';
  contextual(); rerender();
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'PluginLib', version: 2, exportedAt: new Date().toISOString(), status }, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'pluginlib-ma-collection.json' });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.status) Object.assign(status, j.status);
    (j.owned || []).forEach((id) => { status[id] = status[id] || 'owned'; });
    save(); render();
  } catch { alert('Fichier non reconnu.'); }
  e.target.value = '';
});

load().catch((e) => { $('#cards').innerHTML = `<div class="empty">Impossible de charger les données : ${esc(e.message)}</div>`; });
