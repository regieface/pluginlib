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

function meta(html, key) {
  const k = key.replace(/[:.]/g, '\\$&');
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i'));
  if (!a) return null;
  const c = a[0].match(/content=["']([^"']*)["']/i) || a[0].match(/content=([^\s>]+)/i);
  return c ? decode(c[1]).trim() : null;
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

const cleanTitle = (t = '') => t.replace(/\s*[|–—-]\s*[^|–—-]{2,40}$/u, '').replace(/^\s*(buy|shop)\s+/i, '').trim();

export function extractPage(html, url) {
  const ld = jsonLd(html);
  const types = ld.flatMap((x) => [].concat(x['@type'] || []));
  const prod = ld.find((x) => [].concat(x['@type'] || []).some((t) => /^(Product|SoftwareApplication|ProductGroup)$/i.test(t)));
  const ogType = meta(html, 'og:type');
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  let name = (prod && typeof prod.name === 'string' && prod.name) || meta(html, 'og:title') || title;
  name = cleanTitle(stripHtml(name));
  let image = meta(html, 'og:image') || meta(html, 'twitter:image');
  if (!image && prod) { const im = [].concat(prod.image || [])[0]; image = typeof im === 'string' ? im : im?.url || null; }
  if (image) { try { image = new URL(image, url).href; } catch { image = null; } }
  let canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [''])[0].match(/href=["']([^"']+)["']/i)?.[1] || null;
  if (canonical) { try { canonical = new URL(canonical, url).href; } catch { canonical = null; } }
  // Une canonique qui pointe vers l'accueil est ignorée
  if (canonical && new URL(canonical).pathname.length <= 1) canonical = null;
  const description = stripHtml(meta(html, 'og:description') || meta(html, 'description') || (prod && prod.description) || '');
  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0];
  const bodyText = stripHtml(main).slice(0, 4000);
  return {
    name, image, canonical, description, keywords: meta(html, 'keywords') || '', bodyText,
    isProduct: !!prod || /product/i.test(ogType || '') || types.some((t) => /Product/i.test(t))
  };
}

export function parseSitemap(xml) {
  const sitemaps = [], locs = [];
  for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) sitemaps.push(decode(m[1]));
  for (const m of xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/url>/gi)) locs.push(decode(m[1]));
  return { sitemaps, locs };
}
