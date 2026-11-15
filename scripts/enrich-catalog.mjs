// Complète les métadonnées du catalogue existant sans relancer sa découverte.
// Usage : node scripts/enrich-catalog.mjs (sources : fiches constructeur déjà référencées).
import { readFile, writeFile } from 'node:fs/promises';
import { get } from './update.mjs';
import { extractPage } from './parse.mjs';
import { inferCatalogMetadata, resolveReplacements, applyCatalogOverride } from '../catalog.mjs';
import { extractPublishedLatency, normalizePricing, fullLicenseVariant } from './product-facts.mjs';
import {productStatement} from './source-statements.mjs';
import { applyColorationMetadata } from '../coloration.mjs';
import { auditFeatureEvidence } from './feature-evidence.mjs';
import { auditCategoryEvidence } from './category-evidence.mjs';
import { auditRecordType } from '../record-types.mjs';

const root = new URL('../', import.meta.url);
const path = new URL('data/plugins.json', root);
const data = JSON.parse(await readFile(path, 'utf8'));
let index = 0, checked = 0, enriched = 0;
const now = new Date().toISOString();
const names = new Set((process.env.ONLY_VENDOR || '').split(',').map((s) => s.trim()).filter(Boolean));
const pending = data.plugins.filter((p) => p.url && (!names.size || names.has(p.vendor)));
await Promise.all(Array.from({ length: 8 }, async () => {
  while (index < pending.length) {
    const p = pending[index++];
    const r = await get(p.url, { tries: 1, timeout: 15000 });
    checked++;
    if (r.status === 200 && new URL(r.url).pathname !== '/') {
      const page = extractPage(r.text, r.url, p.vendor);
      if(p.category==='other' && p.recordTypeEvidence?.method!=='reviewed-source') Object.assign(p,productStatement(r.text,p)||{});
      const metadata = inferCatalogMetadata({ text: page.metadataText, operatingSystem: page.operatingSystem, price: page.price, url: r.url, checkedAt: now, listed: page.isProduct });
      if (metadata.platforms.length) { p.platforms = metadata.platforms; p.platformEvidence = metadata.platformEvidence; }
      if (metadata.catalogStatus !== 'unknown') { p.catalogStatus = metadata.catalogStatus; p.statusEvidence = metadata.statusEvidence; }
      if (metadata.catalogStatus === 'free') delete p.pricing;
      else if (page.pricing) p.pricing = page.pricing;
      else if (p.pricing && p.pricing.extractionVersion !== 2) delete p.pricing;
      else if (p.pricing && p.pricing.sourceType !== 'retailer') p.pricing = { ...p.pricing, stale: true, lastAttemptAt: now, checkResult: 'price-missing' };
      if (page.image) p.image = page.image;
      const latency = extractPublishedLatency(page.metadataText, r.url, now);
      // Le tableau Waves reste prioritaire sur une formulation commerciale qui
      // peut concerner une variante Live ou un réglage particulier.
      if (p.vendor === 'Waves' && p.latency) delete latency.latency;
      if (latency.latencyInfo) Object.assign(p, latency);
      else if (p.latencyInfo && /\b(?:Apollo|ASIO|audio interface|driver|buffer size|round.trip|monitoring)\b/i.test(p.latencyInfo.excerpt || '')) {
        delete p.latencyInfo;
        if (p.vendor !== 'Waves') delete p.latency;
      }
      if (metadata.platforms.length || metadata.catalogStatus !== 'unknown') enriched++;
    } else if (p.pricing && p.pricing.sourceType !== 'retailer') {
      p.pricing = { ...p.pricing, stale: true, lastAttemptAt: now, checkResult: 'unavailable' };
    }
    if (checked % 100 === 0) console.log(`${checked}/${pending.length} fiches vérifiées, ${enriched} enrichies`);
  }
}));
// Les API de boutique exposent parfois le prix normal séparément du prix promo,
// alors que la fiche n'encode que le tarif réduit dans ses données structurées.
if (process.env.PLUGINLIB_HTTP_CACHE || process.argv.includes('--cache')) {
  const cache = process.env.PLUGINLIB_HTTP_CACHE || process.argv[process.argv.indexOf('--cache') + 1];
  const { readdir } = await import('node:fs/promises');
  for (const file of await readdir(cache)) {
    if (!file.endsWith('.json')) continue;
    let response; try { response = JSON.parse(await readFile(`${cache}/${file}`, 'utf8')); } catch { continue; }
    if (!response.url.includes('/products.json')) continue;
    let shop; try { shop = JSON.parse(response.text); } catch { continue; }
    // Ne pas mêler un tarif de boutique sans devise à une fiche localisée en EUR.
    if (!shop.currency) continue;
    for (const product of shop.products || []) {
      const url = `${new URL(response.url).origin}/products/${product.handle}`;
      const p = data.plugins.find((p) => p.url?.replace(/\/$/, '') === url);
      if (p?.pricing?.currency !== shop.currency || !product.variants?.length) continue;
      const variant = fullLicenseVariant(product);
      if(!variant) continue;
      const pricing = normalizePricing({ current: variant.price, regular: variant.compare_at_price, currency: p.pricing.currency, url, checkedAt: now });
      if (pricing) p.pricing = pricing;
    }
  }
}
for (const p of data.plugins) {
  if (p.vendor === 'Airwindows') p.image = null; // interfaces génériques, pas de GUI propre
}
const overrides = JSON.parse(await readFile(new URL('data/overrides.json', root), 'utf8'));
for (const p of data.plugins) {
  applyCatalogOverride(p, overrides[p.id]);
  auditCategoryEvidence(p, overrides[p.id]);
  auditRecordType(p);
  if(p.catalogStatus==='free') delete p.pricing;
  applyColorationMetadata(p);
  auditFeatureEvidence(p);
}
resolveReplacements(data.plugins);
await writeFile(path, JSON.stringify(data, null, 1));
console.log(`${checked} fiches vérifiées, ${enriched} enrichies. Les données absentes restent inconnues.`);
