// PluginLib — interface. Les données vivent dans data/*.json (mises à jour par GitHub Actions).
const $ = (s) => document.querySelector(s);
const OWN_KEY = 'pluginlib.owned.v1';

// Icônes de catégorie (traits 24×24)
const ICONS = {
  comp: '<path d="M3 18h4l4-12 4 12h6"/><path d="M3 12h18" opacity=".35"/>',
  limiter: '<path d="M3 6h18"/><path d="M3 18c3 0 3-10 6-10s3 10 6 10 3-10 6-10"/>',
  multiband: '<rect x="3" y="10" width="4" height="10"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="13" width="4" height="7"/>',
  eq: '<path d="M3 15c3 0 4-8 7-8s3 10 6 10 3-5 5-5"/>',
  resonance: '<path d="M3 17c2 0 3-2 4-2s2 2 3-6 2 6 3 6 2-2 3-2 2 2 5 2"/><path d="M10 5l4 4M14 5l-4 4"/>',
  channel: '<path d="M6 3v18M12 3v18M18 3v18"/><circle cx="6" cy="8" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="18" cy="10" r="2"/>',
  deesser: '<path d="M16 6a4 4 0 1 0-4 4 4 4 0 1 1-4 4"/><path d="M4 20L20 4"/>',
  gate: '<path d="M3 18h5V6h8v12h5"/>',
  transient: '<path d="M3 18h5l2-14 2 14h9"/>',
  saturation: '<path d="M3 12c2-6 4-6 5-6h8c1 0 3 0 5 6M3 12c2 6 4 6 5 6h8c1 0 3 0 5-6"/>',
  tape: '<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M7 16h10"/>',
  reverb: '<path d="M4 20a16 16 0 0 1 16-16"/><path d="M8 20a12 12 0 0 1 12-12"/><path d="M12 20a8 8 0 0 1 8-8"/>',
  delay: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="1.6" opacity=".7"/><circle cx="18" cy="12" r="1.2" opacity=".45"/>',
  modulation: '<path d="M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>',
  pitch: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  stereo: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
  analysis: '<path d="M4 20V10M9 20V4M14 20v-8M19 20v-5"/>',
  restoration: '<path d="M14 4l6 6-10 10H4v-6z"/><path d="M12 6l6 6"/>',
  mastering: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
  amp: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M6 8h2M10 8h2"/>',
  utility: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16h.01"/>'
};
const icon = (id) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id] || ICONS.other}</svg>`;

const state = { q: '', own: 'all', cat: '', facets: new Set(), common: new Set(), rate: '48', zl: false, zlv: false, haslat: false, vendor: '', sort: 'name' };
let DATA = [], META = null, owned = new Set();

try { owned = new Set(JSON.parse(localStorage.getItem(OWN_KEY) || '[]')); } catch { owned = new Set(); }
const saveOwned = () => { try { localStorage.setItem(OWN_KEY, JSON.stringify([...owned])); } catch { /* stockage indisponible */ } };

const norm = (s) => (s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ms = (samples, rate) => (samples / Number(rate) * 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

function lat(p, rate) {
  const c = p.latency?.[rate];
  if (!c) return null;
  const variantZero = (c.variants || []).some((v) => v.samples === 0);
  return { samples: c.samples, variants: c.variants, note: c.note, zero: c.samples === 0, variantZero };
}

async function load() {
  const [d, m] = await Promise.all([
    fetch('data/plugins.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('data/meta.json', { cache: 'no-cache' }).then((r) => r.json())
  ]);
  DATA = d.plugins.map((p) => ({ ...p, _s: norm(`${p.name} ${p.vendor} ${p.description} ${p.category}`) }));
  META = m;
  buildStatic();
  render();
}

function buildStatic() {
  const L = META.labels;
  const counts = {};
  DATA.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
  const cats = Object.entries(L.categories).filter(([id]) => counts[id]);
  $('#cats').innerHTML = `<button data-v="" class="on">${icon('mastering')}<span>Toutes</span><em>${DATA.length}</em></button>` +
    cats.map(([id, l]) => `<button data-v="${id}">${icon(id)}<span>${l}</span><em>${counts[id]}</em></button>`).join('');
  $('#common').innerHTML = Object.entries(L.common).filter(([k]) => k !== 'zl' || true)
    .map(([k, l]) => `<label class="check"><input type="checkbox" value="opt:${k}"> ${l}</label>`).join('');
  const vendors = [...new Set(DATA.map((p) => p.vendor))].sort((a, b) => a.localeCompare(b));
  $('#vendor').innerHTML = '<option value="">Tous</option>' + vendors.map((v) => `<option>${v}</option>`).join('');
  const d = new Date(META.generatedAt);
  const okN = META.sources.filter((s) => s.ok).length;
  $('#updated').textContent = `Données du ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${META.count} plugins · ${okN}/${META.sources.length} sources lues`;
  $('#sources').innerHTML = '<tr><th>Constructeur</th><th>État</th><th>Méthode</th><th>Plugins</th></tr>' +
    META.sources.map((s) => `<tr><td><a href="${s.site}" target="_blank" rel="noopener">${s.vendor}</a></td><td class="${s.ok ? 'ok' : 'ko'}">${s.ok ? 'à jour' : 'échec' + (s.kept ? ' (données précédentes conservées)' : '')}</td><td>${s.via}</td><td>${s.kept}</td></tr>`).join('') +
    `<tr><td>Latences Waves</td><td class="${META.latency.ok ? 'ok' : 'ko'}">${META.latency.ok ? 'à jour' : 'échec'}</td><td>tableau officiel</td><td>${META.latency.rows ?? '—'}</td></tr>`;
}

function renderFacets() {
  const L = META.labels;
  const box = $('#facets');
  if (!state.cat) { box.innerHTML = ''; return; }
  const inCat = DATA.filter((p) => p.category === state.cat);
  const html = Object.entries(L.facets).filter(([, f]) => f.for.includes(state.cat)).map(([fid, f]) => {
    const vals = Object.entries(f.values).map(([v, l]) => {
      const key = `${fid}:${v}`, n = inCat.filter((p) => p.tags.includes(key)).length;
      return n ? `<button class="chip ${state.facets.has(key) ? 'on' : ''}" data-v="${key}">${l} <em>${n}</em></button>` : '';
    }).join('');
    return vals ? `<h3>${f.label}</h3><div class="chips">${vals}</div>` : '';
  }).join('');
  box.innerHTML = html;
  box.hidden = !html;
}

function filtered() {
  const terms = norm(state.q).split(/\s+/).filter(Boolean);
  return DATA.filter((p) => {
    if (terms.length && !terms.every((t) => p._s.includes(t))) return false;
    if (state.own === 'mine' && !owned.has(p.id)) return false;
    if (state.own === 'notmine' && owned.has(p.id)) return false;
    if (state.cat && p.category !== state.cat) return false;
    for (const f of state.facets) if (!p.tags.includes(f)) return false;
    for (const c of state.common) if (!p.tags.includes(c)) return false;
    if (state.vendor && p.vendor !== state.vendor) return false;
    const l = lat(p, state.rate);
    if (state.haslat && !l) return false;
    if (state.zl && !(l && (l.zero || (state.zlv && l.variantZero)))) return false;
    return true;
  });
}

function latText(p) {
  const l = lat(p, state.rate);
  if (!l) return '';
  const r = state.rate;
  if (l.samples != null) return `<span class="badge ${l.zero ? 'zero' : ''}">${r} kHz · ${l.samples} sample${l.samples > 1 ? 's' : ''} · ${ms(l.samples, r * 1000)} ms</span>`;
  if (l.variants) return l.variants.map((v) => `<span class="badge ${v.samples === 0 ? 'zero' : ''}" title="${v.label}">${v.label} · ${v.samples} smp</span>`).join(' ');
  return `<span class="badge" title="${l.note}">${r} kHz · voir note</span>`;
}

function render() {
  renderFacets();
  const L = META.labels;
  let list = filtered();
  const latKey = (p) => { const l = lat(p, state.rate); return l?.samples ?? (l?.variants ? Math.min(...l.variants.map((v) => v.samples)) : 1e9); };
  list.sort(state.sort === 'vendor' ? (a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name)
    : state.sort === 'latency' ? (a, b) => latKey(a) - latKey(b) || a.name.localeCompare(b.name)
      : (a, b) => a.name.localeCompare(b.name));
  $('#count').textContent = `${list.length} plugin${list.length > 1 ? 's' : ''}${owned.size ? ` · ${owned.size} dans ta collection` : ''}`;
  $('#empty').hidden = list.length > 0;
  const tpl = $('#card').content;
  const frag = document.createDocumentFragment();
  for (const p of list.slice(0, 600)) {
    const n = tpl.cloneNode(true);
    const img = n.querySelector('img'), ini = n.querySelector('.initials');
    ini.textContent = p.vendor.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
    if (p.image) { img.src = p.image; img.alt = p.name; img.onerror = () => img.remove(); } else img.remove();
    n.querySelector('.name').textContent = p.name;
    n.querySelector('.vendor').textContent = p.vendor;
    n.querySelector('.cat').innerHTML = `${icon(p.category)} ${L.categories[p.category] || p.category}${p.classifiedBy === 'manuel' ? ' <small>✔ vérifié</small>' : ''}`;
    const tagLabels = p.tags.map((t) => { const [f, v] = t.split(':'); return f === 'opt' ? L.common[v] : L.facets[f]?.values[v]; }).filter(Boolean);
    n.querySelector('.tags').innerHTML = tagLabels.map((t) => `<span>${t}</span>`).join('');
    n.querySelector('.lat').innerHTML = latText(p);
    const a = n.querySelector('.link');
    if (p.url) { a.href = p.url; a.textContent = 'Fiche constructeur ↗'; } else { a.removeAttribute('href'); a.textContent = 'Fiche non trouvée automatiquement'; a.classList.add('missing'); }
    const b = n.querySelector('.own');
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', owned.has(p.id));
    frag.append(n);
  }
  $('#grid').replaceChildren(frag);
  if (list.length > 600) $('#count').textContent += ' (600 premiers affichés, affine ta recherche)';
}

// ---------- Événements ----------
let t;
$('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); }, 120); });
const seg = (id, key) => $(id).addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  state[key] = b.dataset.v; render();
});
seg('#own', 'own'); seg('#rate', 'rate');
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  $('#cats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  state.cat = b.dataset.v; state.facets.clear(); render();
});
$('#facets').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.facets.has(b.dataset.v) ? state.facets.delete(b.dataset.v) : state.facets.add(b.dataset.v); render();
});
$('#common').addEventListener('change', (e) => { e.target.checked ? state.common.add(e.target.value) : state.common.delete(e.target.value); render(); });
for (const k of ['zl', 'zlv', 'haslat']) $('#' + k).addEventListener('change', (e) => { state[k] = e.target.checked; render(); });
$('#vendor').addEventListener('change', (e) => { state.vendor = e.target.value; render(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
$('#grid').addEventListener('click', (e) => {
  const b = e.target.closest('.own'); if (!b) return;
  const id = b.dataset.id;
  owned.has(id) ? owned.delete(id) : owned.add(id);
  saveOwned(); b.setAttribute('aria-pressed', owned.has(id));
  if (state.own !== 'all') render(); else $('#count').textContent = $('#count').textContent.replace(/ · \d+ dans ta collection|$/, owned.size ? ` · ${owned.size} dans ta collection` : '');
});
$('#reset').addEventListener('click', () => {
  Object.assign(state, { q: '', own: 'all', cat: '', rate: state.rate, zl: false, zlv: false, haslat: false, vendor: '' });
  state.facets.clear(); state.common.clear();
  $('#q').value = ''; $('#vendor').value = '';
  document.querySelectorAll('.filters input[type=checkbox]').forEach((c) => { c.checked = false; });
  $('#own').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0));
  $('#cats').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0));
  render();
});
$('#export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'PluginLib', owned: [...owned] }, null, 1)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'pluginlib-ma-collection.json' });
  a.click(); URL.revokeObjectURL(a.href);
});
$('#import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const j = JSON.parse(await f.text()); (j.owned || []).forEach((id) => owned.add(id)); saveOwned(); render(); } catch { alert('Fichier non reconnu.'); }
  e.target.value = '';
});
$('#toggleFilters').addEventListener('click', () => document.body.classList.toggle('show-filters'));

load().catch((e) => { $('#count').textContent = 'Impossible de charger les données : ' + e.message; });
