// Prix de repli : même produit et même édition, sans déduire de licence ni de disponibilité.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { get } from './update.mjs';
import { extractPage, stripHtml, decode } from './parse.mjs';
import { normalizePricing } from './product-facts.mjs';
import { isPriceStale } from '../catalog.mjs';

const key = (s = '') => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const attr = (tag, name) => decode(tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] || '');
const approvedURL = (url, retailer) => { try { const u = new URL(url); return u.protocol === 'https:' && retailer.hosts.includes(u.hostname); } catch { return false; } };
const eligible = (p) => !['free', 'discontinued', 'superseded', 'upcoming'].includes(p.catalogStatus);
export const needsRetailerPrice = (p, now = Date.now()) => eligible(p) && (!p.pricing || p.pricing.sourceType === 'retailer' || isPriceStale(p.pricing, now));

export function selectPriceCandidates(plugins, registry, limit, now = Date.now()) {
  const candidates = plugins.filter((p) => needsRetailerPrice(p, now));
  const known = (p) => !!registry.products[p.id]?.length || p.pricing?.sourceType === 'retailer';
  // Le quota limite la découverte ; tous les tarifs de repli connus sont revérifiés.
  return [...candidates.filter(known), ...candidates.filter((p) => !known(p))
    .sort((a, b) => (a.retailerPriceCheck?.checkedAt || '').localeCompare(b.retailerPriceCheck?.checkedAt || '')).slice(0, limit)];
}

export function retailerProductMatches(plugin, title) {
  const vendor = key(plugin.vendor);
  const normalize = (s) => {
    let k = key(s.replace(/^\s*(?:buy|view)\s+/i, '').split(/\s+[|–—]\s+|\s*\|\s*/)[0]);
    if (k.startsWith(vendor)) k = k.slice(vendor.length);
    return k.replace(/plugin$/, '');
  };
  if (!key(title).includes(vendor)) return false;
  return [plugin.name, ...(plugin.aliases || [])].some((name) => normalize(title) === normalize(name));
}

function parseBoutiquePricing(plugin, html, url) {
  // view_item porte l'identité et le prix du seul produit consulté.
  for (const match of html.matchAll(/\bdata-event=(["'])([\s\S]*?)\1/gi)) {
    let event; try { event = JSON.parse(decode(match[2])); } catch { continue; }
    if (event.event !== 'view_item' || event.ecommerce?.items?.length !== 1) continue;
    const item = event.ecommerce.items[0];
    if (!retailerProductMatches(plugin, `${item.item_brand || ''} ${item.item_name || ''}`)) continue;
    const urlID = new URL(url).pathname.match(/\/(\d+)-[^/]+$/)?.[1];
    if (!urlID || String(item.item_id) !== urlID) continue;
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
    if (!h1 || !retailerProductMatches(plugin, `${item.item_brand} ${stripHtml(h1)}`)) continue;
    const region = html.match(/<div\b[^>]*data-product-purchase-options-target=["']otpPrice["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '';
    const strike = region.match(/<span\b[^>]*class=["'][^"']*line-through[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const currency = item.currency;
    const symbol = { EUR: '€', USD: '$', GBP: '£' }[currency];
    const regular = strike && symbol && stripHtml(strike).includes(symbol) ? stripHtml(strike).replace(symbol, '').trim() : null;
    const price = normalizePricing({ current: item.price, regular, currency, url, checkedAt: new Date().toISOString() });
    if (price && Number(item.discount) > 0 && price.promo === null) { price.promo = price.normal; price.normal = null; }
    return price;
  }
  return null;
}

export function parseRetailerPricing(plugin, html, url, sourceName) {
  const page = extractPage(html, url, sourceName);
  let pricing;
  if (sourceName === 'Plugin Boutique') pricing = parseBoutiquePricing(plugin, html, url);
  else {
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || page.name);
    if (!retailerProductMatches(plugin, title) || /outofstock|discontinued|no longer available/i.test(html.match(/itemprop=["']availability["'][^>]+/i)?.[0] || '')) return null;
    pricing = page.pricing;
    if (!pricing || sourceName === 'Thomann') {
      const micro = (property) => {
        const tag = [...html.matchAll(/<meta\b[^>]+>/gi)].map((m) => m[0]).find((tag) => attr(tag, 'itemprop') === property);
        return tag && attr(tag, 'content');
      };
      pricing = normalizePricing({ current: micro('price'), currency: micro('priceCurrency'), url, checkedAt: new Date().toISOString() });
      if (pricing && sourceName === 'Thomann') {
        const start = html.search(/<meta\b[^>]*itemprop=["']price["']/i);
        const block = html.slice(start).split(/<link\b[^>]*itemprop=["']availability["']/i)[0].slice(0, 6000);
        if (/strike-price-saving-percentage["'][^>]*>\s*-\d/.test(block)) { pricing.promo = pricing.normal; pricing.normal = null; }
      }
    }
  }
  return pricing ? { ...pricing, url, sourceName, sourceType: 'retailer', checkedAt: new Date().toISOString() } : null;
}

export function findRetailerLinks(plugin, html, base, catalogVendor = '') {
  const urls = new Set();
  for (const match of html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)) {
    const href = attr(match[1], 'href');
    let url; try { url = new URL(href, base); } catch { continue; }
    const host = new URL(base).hostname;
    if (url.hostname !== host || url.protocol !== 'https:') continue;
    if (host.endsWith('.thomann.de') || host === 'thomann.de') { if (!/\.htm$/.test(url.pathname)) continue; }
    else if (host === 'www.pluginboutique.com') { if (!/^\/(?:product\/.+\/|products\/)\d+-[^/]+$/.test(url.pathname)) continue; }
    else continue;
    const label = attr(match[1], 'aria-label').replace(/^View\s+/i, '') || stripHtml(match[2]);
    const candidate = catalogVendor === plugin.vendor && !key(label).startsWith(key(plugin.vendor)) ? `${plugin.vendor} ${label}` : label;
    if (retailerProductMatches(plugin, candidate)) urls.add(url.origin + url.pathname);
  }
  return [...urls].slice(0, 3);
}

export function findManufacturerCatalog(vendor, html, base) {
  for (const match of html.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/gi)) {
    const label = attr(match[1], 'aria-label').replace(/^Brand\s+/i, '') || stripHtml(match[2]);
    if (key(label) !== key(vendor)) continue;
    let url; try { url = new URL(attr(match[1], 'href'), base); } catch { continue; }
    if (url.origin === new URL(base).origin && /^\/manufacturers\/\d+-[^/]+$/.test(url.pathname)) return url.href;
  }
  return null;
}

export async function collectRetailerPrice(plugin, registry, { fetchPage = get, pageCache = new Map(), failures = new Map(), now = new Date().toISOString() } = {}) {
  const links = new Set(registry.products[plugin.id] || []);
  const checks = [];
  const cachedPage = (url) => {
    if (!pageCache.has(url)) pageCache.set(url, fetchPage(url, { tries: 1, timeout: 12000 }));
    return pageCache.get(url);
  };
  for (const retailer of registry.retailers) {
    let urls = [...links].filter((url) => approvedURL(url, retailer));
    if (plugin.pricing?.sourceType === 'retailer' && approvedURL(plugin.pricing.url, retailer)) urls.push(plugin.pricing.url);
    let attempted = false, result = 'not-found';
    if (!urls.length && (failures.get(retailer.name) || 0) < 3) {
      let catalog = retailer.catalogs?.[plugin.vendor];
      if (!catalog && retailer.manufacturerIndexURL) {
        const index = await cachedPage(retailer.manufacturerIndexURL);
        if (index.status === 200 && approvedURL(index.url, retailer)) catalog = findManufacturerCatalog(plugin.vendor, index.text, index.url);
      }
      const discoveryURL = catalog || (retailer.searchURL && retailer.searchURL + encodeURIComponent(`${plugin.vendor} ${plugin.name}`));
      if (discoveryURL && approvedURL(discoveryURL, retailer)) {
        attempted = true;
        const response = await cachedPage(discoveryURL);
        if (response.status === 200 && approvedURL(response.url, retailer)) urls = findRetailerLinks(plugin, response.text, response.url, catalog ? plugin.vendor : '');
        else { result = 'unavailable'; failures.set(retailer.name, (failures.get(retailer.name) || 0) + 1); }
      }
    }
    for (const url of new Set(urls)) {
      attempted = true;
      const response = await cachedPage(url);
      if (response.status !== 200 || !approvedURL(response.url, retailer)) { result = 'unavailable'; continue; }
      const pricing = parseRetailerPricing(plugin, response.text, response.url, retailer.name);
      if (!pricing) { result = 'unverified'; continue; }
      links.add(url); links.add(response.url);
      checks.push({ source: retailer.name, result: 'found' });
      return { pricing, links: [...links], check: { checkedAt: now, result: 'found', source: retailer.name, attempts: checks } };
    }
    if (attempted) checks.push({ source: retailer.name, result });
  }
  const pricing = plugin.pricing ? { ...plugin.pricing, stale: true, lastAttemptAt: now, checkResult: checks.some((c) => c.result === 'unavailable') ? 'unavailable' : 'price-missing' } : undefined;
  return { pricing, links: [...links], check: { checkedAt: now, result: checks.some((c) => c.result === 'unavailable') ? 'unavailable' : 'not-found', attempts: checks } };
}

async function main() {
  const root = new URL('../', import.meta.url);
  const path = new URL('data/plugins.json', root), registryPath = new URL('sources/retailer-links.json', root);
  const data = JSON.parse(await readFile(path, 'utf8')), registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const only = (process.env.ONLY_VENDOR || '').split(',').map((s) => s.trim()).filter(Boolean);
  const arg = process.argv.indexOf('--limit'), limit = arg >= 0 ? Number(process.argv[arg + 1]) : 200;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit doit être un entier positif.');
  const pending = selectPriceCandidates(data.plugins.filter((p) => !only.length || only.includes(p.vendor)), registry, limit);
  const pageCache = new Map(), failures = new Map(), updates = new Map();
  let cursor = 0, found = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < pending.length) {
      const p = pending[cursor++];
      const update = await collectRetailerPrice(p, registry, { pageCache, failures });
      updates.set(p.id, update);
      if (update.check.result === 'found') found++;
      if (updates.size % 25 === 0) console.log(`${updates.size}/${pending.length} fiches traitées, ${found} tarifs confirmés.`);
    }
  }));
  const latest = JSON.parse(await readFile(path, 'utf8')), latestRegistry = JSON.parse(await readFile(registryPath, 'utf8'));
  for (const p of latest.plugins) {
    const update = updates.get(p.id); if (!update) continue;
    p.retailerPriceCheck = update.check;
    if (needsRetailerPrice(p) && update.pricing) p.pricing = update.pricing;
    if (update.links.length) latestRegistry.products[p.id] = [...new Set([...(latestRegistry.products[p.id] || []), ...update.links])];
  }
  await writeFile(path, JSON.stringify(latest, null, 1));
  await writeFile(registryPath, JSON.stringify(latestRegistry, null, 2) + '\n');
  console.log(`${pending.length} fiches traitées, ${found} tarifs revendeur confirmés. Liens vérifiés enregistrés.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch((e) => { console.error(e); process.exit(1); });
