// Outils d'extraction sans dépendance externe.
import { extractPricing, normalizePricing } from './product-facts.mjs';

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

// Retire les sous-arbres masqués/navigation. Le JSON Waves caché dans une div
// décrit tout son catalogue et ne doit jamais devenir le texte du produit.
export function visibleProductHtml(html = '', { preservePriceMarkup = false } = {}) {
  const source = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  const stack = [], output = [];
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for (const match of source.matchAll(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+|</gi)) {
    const token = match[0];
    if (token.startsWith('<!--')) continue;
    const tag = token.match(/^<(\/)?([a-z][\w:-]*)/i);
    if (!tag) { if (!stack.some((x) => x.skip)) output.push(token); continue; }
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      const index = stack.findLastIndex((x) => x.name === name);
      const skip = stack.some((x) => x.skip);
      if (index >= 0) stack.splice(index);
      if (!skip) output.push(token);
      continue;
    }
    const classes = `${attr(token, 'class') || ''} ${attr(token, 'id') || ''}`;
    const price = preservePriceMarkup && (/price|amount|currency/i.test(classes) || ['del','ins'].includes(name) || stack.some(x=>x.price));
    const skip = stack.some((x) => x.skip) || !['html','body'].includes(name) && (['nav','header','footer','aside','svg'].includes(name)
      || /\shidden(?:\s|=|>|\/)/i.test(token) || attr(token, 'aria-hidden') === 'true' && !price
      || /(?:^|[\s_-])(?:hidden|menu|navbar|navigation|sidebar|related|recommendations|testimonials|reviews|popup|modal|labs-item|product-carousel__img|m-product-similar)(?:$|[\s_-])/i.test(classes)
      || /\bbtn-variant\b/.test(classes) && !/\bactive\b/.test(classes)
      || /display\s*:\s*none/i.test(attr(token, 'style') || ''));
    if (!voids.has(name) && !/\/\s*>$/.test(token)) stack.push({ name, skip, price });
    if (!skip) output.push(token);
  }
  return output.join(' ');
}

export function slug(s = '') {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Lit un attribut HTML, qu'il soit entre guillemets doubles, simples, ou sans guillemets
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
}

function documentBase(html,url) {
  const base=html.match(/<base\b[^>]*>/i)?.[0];
  try { return base&&attr(base,'href') ? new URL(attr(base,'href'),url).href : url; } catch { return url; }
}

export function extractLinks(html, base) {
  base=documentBase(html,base);
  const links = new Set();
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(match[0], 'href');
    if (!href || href.startsWith('#')) continue;
    try { const url = new URL(href, base); if (/^https?:$/.test(url.protocol)) links.add(url.href.replace(/\/$/, '')); } catch { /* lien invalide */ }
  }
  return [...links];
}

function meta(html, key) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const k = attr(m[0], 'property') || attr(m[0], 'name');
    if (k && k.toLowerCase() === key.toLowerCase()) return attr(m[0], 'content');
  }
  return null;
}

const BAD_IMG = /((?:^|[\/_.-])(?:logo|icons?|favicon|flag|avatar|sprite|badge)(?:[\/_.-]|\d|$)|payment|paypal|cookie|consent|placeholder|spinner|loader|hamburger|typeonly|cart[-_.]|artistsection|videothumb|\.svg(\?|$)|1x1|pixel|blank\.)/i;
const GENERIC_IMG = /(preview-image|share-default|default-share|og-default|social-share|bundle|collection|banner-default)/i;

// Choisit le visuel le plus représentatif du produit parmi toutes les images de la page
function pickImage(html, url, name, ogImage, ldImage) {
  const base=documentBase(html,url);
  const abs = (u) => { try { return new URL(u, base).href; } catch { return null; } };
  let pageSlug = '';
  try { pageSlug = new URL(url).pathname.split('/').filter((x) => x && !/^(overview|products?|plugins?|plug-ins|software-effects|en|fr)$/i.test(x)).pop() || ''; } catch { /* */ }
  pageSlug = pageSlug.toLowerCase().replace(/\.html?$/, '');
  const isMcDSP = /(^|\.)mcdsp\.com$/i.test(new URL(url).hostname);
  const nameKey = slug(name || '');
  const cands = new Map();
  const add = (u, base, alt = '') => {
    const a = u && abs(u); if (!a || BAD_IMG.test(a)) return;
    const low = a.toLowerCase(); let sc = base;
    if (/\b(gui|interface|screenshot|main image|plugin image|plugin ui)\b/i.test(alt)) sc += 20;
    if (pageSlug && pageSlug.length > 2 && low.includes(pageSlug)) sc += 4;
    if (nameKey && nameKey.length > 2 && (low.includes(nameKey) || slug(alt).includes(nameKey))) sc += 3;
    if (/\/(gui|screenshots?|max|600|product)\//i.test(low)) sc += 2;
    if (/(?:_App\d|_Feature|[-_]GUI[-_.])/i.test(low)) sc += 5;
    // Chez McDSP, App1/App2/App3 sont des détails recadrés. Feature montre
    // l'interface complète ; Phone et Glamor sont des montages promotionnels.
    if (isMcDSP) {
      if (/_App\d|_Phone|Glamor|Thumbnail/i.test(low)) return;
      if (/_Feature(?!.*Phone)/i.test(low)) sc += 60;
      if (/Fullsize/i.test(low)) sc += 45;
    }
    if (/\/(hero|banner|share|social)\//i.test(low)) sc -= 1;
    if (GENERIC_IMG.test(low)) sc -= 6;
    if (/box|packaging|3d|testimonial|artist/i.test(alt)) sc -= 10;
    cands.set(a, Math.max(cands.get(a) ?? -99, sc));
  };
  if (ogImage) add(ogImage, 3);
  if (ldImage) add(ldImage, 3);
  const main = visibleProductHtml((html.match(/<main[\s\S]*?<\/main>/i) || [html])[0]);
  for (const m of main.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0], alt = attr(t, 'alt') || '';
    const srcset = (attr(t, 'srcset') || attr(t, 'data-srcset') || '').split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean).pop();
    const ix = attr(t, 'ix-path'); const ixFull = ix && ogImage ? (() => { try { return new URL(ix, new URL(ogImage).origin).href; } catch { return null; } })() : null;
    for (const u of [attr(t, 'src'), attr(t, 'data-src'), attr(t, 'data-lazy-src'), srcset, ixFull]) if (u && !u.startsWith('data:')) add(u, 0, alt);
  }
  // Certains constructeurs affichent l'interface en image de fond CSS.
  for (const m of main.matchAll(/url\(\s*["']?([^\s"')]+\.(?:png|jpe?g|webp)(?:\?[^\s"')]*)?)["']?\s*\)/gi)) add(m[1], 0);
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
  name = name.replace(/:\s*free\b.*\bplug-?in\b.*$/i, '').trim();
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
  // Sans <main>, les menus globaux peuvent citer les fonctions et plateformes
  // d'autres produits. Ne pas les utiliser comme caractéristiques de cette fiche.
  const content = html.replace(/<(nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  let main = (content.match(/<main[\s\S]*?<\/main>/i) || [content])[0];
  let legacyProduct = false;
  if (/(^|\.)meldaproduction\.com$/i.test(new URL(url).hostname)) {
    main=main.split(/<(?:div|section)\b[^>]*class=["'][^"']*\bm-product-similar\b/i)[0];
    legacyProduct=/class=["'][^"']*\bm-buybox\b/.test(main)&&/<h1\b/i.test(main);
  }
  if (/(^|\.)bluecataudio\.com$/i.test(new URL(url).hostname) && /\/Products\/Product_/i.test(new URL(url).pathname)) {
    // Le menu « Freeware » est commun aux produits gratuits et payants.
    const start = content.search(/<div\b[^>]*class=["']content_title["']/i);
    if (start >= 0) {
      main = content.slice(start).split(/<a\b[^>]*name=["'](?:History|Related)["']/i)[0];
      legacyProduct = /class=["']price["']/i.test(main);
    }
  }
  const productText = stripHtml(visibleProductHtml(main)).split(/\b(?:More from [^\n]+|Related products|You may also like|Recommended products)\b/i)[0];
  const bodyText = productText.slice(0, 4000);
  const application = ld.find((x) => x.operatingSystem);
  const offers = [].concat(prod?.offers || [])[0];
  const offer = offers?.offers ? [].concat(offers.offers)[0] : offers;
  let pricing = extractPricing({ html: visibleProductHtml(main, {preservePriceMarkup:true}), offer, currency: meta(html, 'product:price:currency'), url: canonical || url, checkedAt: new Date().toISOString() });
  let editionPrice;
  if (/(^|\.)wavesfactory\.com$/i.test(new URL(url).hostname) && /\/audio-plugins\/[^/]+\/?$/.test(new URL(url).pathname)) {
    const regular=[...main.matchAll(/<span\b[^>]*class=["'][^"']*\bpaddle-gross\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map(m=>extractPricing({html:`<p class="price">${m[1]}</p>`,url:canonical||url,checkedAt:new Date().toISOString()})).find(Boolean);
    if(pricing&&regular?.currency===pricing.currency)pricing=normalizePricing({current:pricing.promo??pricing.normal,regular:regular.normal,currency:pricing.currency,url:pricing.url,checkedAt:pricing.checkedAt});
  }
  if (/(^|\.)unitedplugins\.com$/i.test(new URL(url).hostname)) {
    const cart=[...main.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].find(m=>/\bbtn-primary-cart\b/.test(attr(m[0].split('>')[0]+'>','class')||''));
    if(cart){const price=(cart[0].match(/class=["']price-display["'][^>]*>([\s\S]*?)<\//i)||[])[1];const regular=(cart[0].match(/class=["']crossed["'][^>]*>([\s\S]*?)<\//i)||[])[1];const own=extractPricing({html:`<span class="price">${price||''}</span>`,url:canonical||url,checkedAt:new Date().toISOString()});pricing=own?normalizePricing({current:own.normal,regular:stripHtml(regular||''),currency:own.currency,url:own.url,checkedAt:own.checkedAt}):null;if(/\bFREE\b/i.test(stripHtml(price||'')))editionPrice=0;}
  }
  if (/(^|\.)d16\.pl$/i.test(new URL(url).hostname)) {
    // Le tarif du produit se trouve dans sa barre de navigation dédiée.
    const header=html.slice(html.indexOf('header-modern-menu')).split('related-products')[0];
    const block=header.match(/<div\b[^>]*class=["']price["'][^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if(block){const old=block.match(/<span\b[^>]*text-decoration-line-through[^>]*>([\s\S]*?)<\/span>/i)?.[1];const current=stripHtml(old?block.replace(/<span\b[^>]*text-decoration-line-through[^>]*>[\s\S]*?<\/span>/i,''):block);pricing=normalizePricing({current,regular:old?stripHtml(old):null,currency:/€/.test(stripHtml(block))?'EUR':null,url:canonical||url,checkedAt:new Date().toISOString()});}
  }
  if (/(^|\.)meldaproduction\.com$/i.test(new URL(url).hostname)) {
    const box=main.search(/class=["'][^"']*\bm-buybox\b/);
    if(box>=0&&/\bFree (?:effect|instrument)\b/i.test(stripHtml(main.slice(box,box+2500)))){editionPrice=0;pricing=null;}
    // Le sélecteur présente les autres éditions avant celle visitée ; les cartes
    // de recommandations ont aussi leurs propres tarifs.
    const active = [...main.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].find(m=>/\bbtn-variant\b/.test(attr(m[0].split('>')[0]+'>','class')||'') && /\bactive\b/.test(attr(m[0].split('>')[0]+'>','class')||''));
    if (active) {
      const text=stripHtml(active[0]);
      if (/\bFREE\b/i.test(text)) { editionPrice=0; pricing=null; }
      else {
        const own=extractPricing({html:active[0],url:canonical||url,checkedAt:new Date().toISOString()});
        const regular=stripHtml(main).match(/Regular Price:\s*(€|£|EUR|GBP|USD|\$)\s*([\d.,]+)/i);
        if(own) pricing=normalizePricing({current:own.promo??own.normal,regular:regular?.[2],currency:own.currency,url:own.url,checkedAt:own.checkedAt});
      }
    }
  }
  return {
    name, image, images, canonical, description, keywords: meta(html, 'keywords') || '', bodyText,
    metadataText: productText,
    operatingSystem: [].concat(application?.operatingSystem || []).join(' '),
    price: editionPrice ?? pricing?.promo ?? pricing?.normal ?? offer?.price ?? offer?.lowPrice ?? null,
    pricing,
    brand: typeof prod?.brand === 'string' ? prod.brand : prod?.brand?.name || '',
    isCatalogProduct: /data-product-id\s*=/i.test(html),
    isProduct: legacyProduct || !!prod || /product/i.test(ogType || '') || types.some((t) => /Product/i.test(t))
  };
}

export function parseSitemap(xml) {
  const sitemaps = [], locs = [];
  for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) sitemaps.push(decode(m[1]));
  for (const m of xml.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/url>/gi)) locs.push(decode(m[1]));
  return { sitemaps, locs };
}
