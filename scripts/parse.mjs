// Outils d'extraction sans dépendance externe.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', trade: '™', reg: '®', copy: '©' };
export function decode(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(s = '') {
  return decode(String(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')).replace(/[ \t\r]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

export function slug(s = '') {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Lit un attribut HTML, qu'il soit entre guillemets doubles, simples, ou sans guillemets
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
}

function meta(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = attr(m[0], 'property') || attr(m[0], 'name');
    if (k && k.toLowerCase() === key.toLowerCase()) return attr(m[0], 'content');
  }
  return null;
}

const BAD_IMG = /(logo|icon|favicon|flag|avatar|sprite|badge|payment|paypal|visa|cookie|consent|placeholder|spinner|loader|\.svg(\?|$)|1x1|pixel|blank\.)/i;
const GENERIC_IMG = /(preview-image|share-default|default-share|og-default|social-share|bundle|collection|banner-default)/i;

// Choisit le visuel le plus représentatif du produit parmi toutes les images de la page
function pickImage(html, url, name, ogImage, ldImage) {
  const abs = (u) => { try { return new URL(u, url).href; } catch { return null; } };
  let pageSlug = '';
  try { pageSlug = new URL(url).pathname.split('/').filter((x) => x && !/^(overview|products?|plugins?|plug-ins|software-effects|en|fr)$/i.test(x)).pop() || ''; } catch { /* */ }
  pageSlug = pageSlug.toLowerCase().replace(/\.html?$/, '');
  const nameKey = slug(name || '');
  const cands = new Map();
  const add = (u, base, alt = '') => {
    const a = u && abs(u); if (!a || BAD_IMG.test(a)) return;
    const low = a.toLowerCase(); let sc = base;
    if (/\b(gui|interface|screenshot|main image|plugin image)\b/i.test(alt)) sc += 5;
    if (pageSlug && pageSlug.length > 2 && low.includes(pageSlug)) sc += 4;
    if (nameKey && nameKey.length > 2 && (low.includes(nameKey) || slug(alt).includes(nameKey))) sc += 3;
    if (/\/(gui|screenshots?|max|600|product)\//i.test(low)) sc += 2;
    if (/\/(hero|banner|share|social)\//i.test(low)) sc -= 1;
    if (GENERIC_IMG.test(low)) sc -= 6;
    cands.set(a, Math.max(cands.get(a) ?? -99, sc));
  };
  if (ogImage) add(ogImage, 3);
  if (ldImage) add(ldImage, 3);
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  for (const m of main.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0], alt = attr(t, 'alt') || '';
    const srcset = (attr(t, 'srcset') || attr(t, 'data-srcset') || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const ix = attr(t, 'ix-path'); const ixFull = ix && ogImage ? (() => { try { return new URL(ix, new URL(ogImage).origin).href; } catch { return null; } })() : null;
    for (const u of [attr(t, 'src'), attr(t, 'data-src'), attr(t, 'data-lazy-src'), srcset, ixFull]) if (u && !u.startsWith('data:')) add(u, 0, alt);
  }
  const ranked = [...cands.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
  return { image: ranked[0] || null, images: ranked.slice(0, 4) };
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const walk = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(walk); out.push(x); if (x['@graph']) walk(x['@graph']); };
      walk(j);
    } catch { /* JSON-LD invalide : ignoré */ }
  }
  return out;
}

// Titre de page → nom du produit : on coupe sur " | ", " - ", " – ", " — " et on retire
// les morceaux qui ne sont que le nom du constructeur ou une mention commerciale.
export function cleanTitle(t = '', vendor = '') {
  const v = vendor.toLowerCase().replace(/[^a-z0-9]/g, '');
  const GENERIC = new Set(['', 'audio', 'inc', 'ltd', 'gmbh', 'software', 'plugins', 'plugin', 'official', 'music', 'dsp', 'digital', 'com', 'store', 'shop']);
  const isVendor = (x) => { const k = x.toLowerCase().replace(/[^a-z0-9]/g, ''); return !!v && k.startsWith(v) && GENERIC.has(k.slice(v.length)); };
  const parts = t.split(/\s+[|–—-]\s+|\s*\|\s*/).map((x) => x.replace(/^\s*(buy|shop)\s+/i, '').trim()).filter(Boolean);
  const keep = parts.filter((x) => !isVendor(x) && !/^(official site|home|plug-?ins?|software|audio plug-?ins?)$/i.test(x));
  let name = (keep[0] || parts[0] || '').trim();
  // « oeksound: soothe3 » → « soothe3 »
  const m = name.match(/^([^:]{2,30}):\s+(.+)$/);
  if (m && isVendor(m[1])) name = m[2];
  return name;
}

export function extractPage(html, url, vendor = '') {
  const ld = jsonLd(html);
  const types = ld.flatMap((x) => [].concat(x['@type'] || []));
  const prod = ld.find((x) => [].concat(x['@type'] || []).some((t) => /^(Product|SoftwareApplication|ProductGroup)$/i.test(t)));
  const ogType = meta(html, 'og:type');
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  let name = (prod && typeof prod.name === 'string' && prod.name) || meta(html, 'og:title') || title;
  name = cleanTitle(stripHtml(name), vendor);
  let ldImg = null;
  if (prod) { const im = [].concat(prod.image || [])[0]; ldImg = typeof im === 'string' ? im : im?.url || null; }
  const { image, images } = pickImage(html, url, name, meta(html, 'og:image') || meta(html, 'twitter:image'), ldImg);
  const canTag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => (attr(t, 'rel') || '').toLowerCase() === 'canonical');
  let canonical = canTag ? attr(canTag, 'href') : null;
  if (canonical) { try { canonical = new URL(canonical, url).href; } catch { canonical = null; } }
  // Une canonique qui pointe vers l'accueil est ignorée
  if (canonical && new URL(canonical).pathname.length <= 1) canonical = null;
  const description = stripHtml(meta(html, 'og:description') || meta(html, 'description') || (prod && prod.description) || '');
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  const bodyText = stripHtml(main).slice(0, 4000);
  return {
    name, image, images, canonical, description, keywords: meta(html, 'keywords') || '', bodyText,
    isProduct: !!prod || /product/i.test(ogType || '') || types.some((t) => /Product/i.test(t))
  };
}

export function parseSitemap(xml) {
  const sitemaps = [], locs = [];
  for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) sitemaps.push(decode(m[1]));
  for (const m of xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/url>/gi)) locs.push(decode(m[1]));
  return { sitemaps, locs };
}
