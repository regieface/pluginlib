import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPricing, normalizePricing, extractPublishedLatency } from './product-facts.mjs';
import { hasDocumentedLatency, matchesCatalogFilters } from '../catalog.mjs';
import { isHome } from './update.mjs';

test('une URL produit mp-eq ne doit pas être prise pour une langue', () => {
  assert.equal(isHome('https://pulsar.audio/mp-eq/'), false);
  assert.equal(isHome('https://x.com/en-us/'), true);
});

test('prix normal et promo : valeurs exactes, devise et date de source', () => {
  const price = normalizePricing({ current: '59.00', regular: '149.00', currency: 'EUR', url: 'https://v.com/p', checkedAt: '2026-11-15' });
  assert.equal(price.normal, 149);
  assert.equal(price.promo, 59);
  assert.equal(price.currency, 'EUR');
  assert.equal(normalizePricing({ current: 49 }), null);
});

test('HTML promotionnel : ne pas prendre le prix d’un produit suggéré', () => {
  const pricing = extractPricing({ html: '<p class="price"><del><span>149,00 €</span></del><ins><span>59,00 €</span></ins></p><p class="price">999 €</p>', offer: { price: '59', priceCurrency: 'EUR' } });
  assert.equal(pricing.normal, 149);
  assert.equal(pricing.promo, 59);
});

test('offre normale ou gratuite : pas de fausse promotion', () => {
  assert.equal(extractPricing({ html: '<p class="price">$49</p><footer>Autre produit : 99 €</footer>' }), null);
  assert.equal(normalizePricing({ current: 0, regular: 0, currency: 'USD' }).promo, null);
  assert.equal(normalizePricing({ current: '1,299.00', currency: 'USD' }).normal, 1299);
  assert.equal(normalizePricing({ current: '1.299,00', currency: 'EUR' }).normal, 1299);
});

test('latence : ne jamais assimiler tampon audio et latence d’un plugin', () => {
  assert.deepEqual(extractPublishedLatency('Apollo provides zero-latency monitoring.'), {});
  assert.deepEqual(extractPublishedLatency('ASIO driver buffer size: 64 samples latency.'), {});
});

test('latence conditionnelle : ne pas transformer un mode zéro latence en propriété générale', () => {
  const p = extractPublishedLatency('Zero latency mode is available; linear-phase mode adds latency.', 'https://v.com', '2026-11-15');
  assert.equal(p.latencyInfo.conditional, true);
  assert.equal(p.latency, undefined);
  assert.equal(hasDocumentedLatency(p), true);
});

test('latence en samples : aucune conversion sans fréquence publiée', () => {
  const p = extractPublishedLatency('Processing latency is 64 samples.', 'https://v.com', '2026-11-15');
  assert.equal(p.latency, undefined);
  assert.deepEqual(p.latencyInfo.values, [{ value: 64, unit: 'samples' }]);
  const q = extractPublishedLatency('Latency: 64 samples at 48 kHz.');
  assert.equal(q.latency[48].samples, 64);
  assert.equal(q.latency[96], undefined);
});

test('compteur global : un plugin multiformat et multifréquence compte une fois', () => {
  assert.equal(hasDocumentedLatency({ latency: { 48: null, 96: null } }), false);
  assert.equal(hasDocumentedLatency({ latency: { 48: null, 96: { samples: 0 } } }), true);
  const plugins = [{ latency: { 48: { samples: 0 }, 96: { samples: 0 } } }, { latencyInfo: { zero: true } }, {}];
  assert.equal(plugins.filter(hasDocumentedLatency).length, 2);
  assert.equal(matchesCatalogFilters({ platforms: ['macos', 'windows', 'linux'] }), true);
});
