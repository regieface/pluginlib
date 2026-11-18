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

const latencySource = 'https://example.test/latency';
const parseLatency = text => extractPublishedLatency(text, latencySource, '2026-11-18');

test('les annonces ZL restent qualitatives, y compris les annonces de mode', () => {
  for (const text of [
    'This plugin has zero latency.', 'Zero-latency mode.', 'No additional latency.',
    'No added latency.', 'Latency free.', 'Zero latency at 48 kHz.'
  ]) {
    const result = parseLatency(text);
    assert.equal(result.latency, undefined, text);
    assert.equal(result.latencyInfo.zero, true, text);
    assert.equal(result.latencyInfo.url, latencySource);
    assert.deepEqual(result.latencyInfo.values, []);
    assert.deepEqual(parseLatency(text), result);
  }
  assert.equal(parseLatency('Zero-latency mode.').latencyInfo.conditional, true);
});

test('un zéro numérique n’est publié que pour la fréquence explicitement associée', () => {
  assert.deepEqual(parseLatency('0 samples at 48 kHz').latency, { 48: { samples: 0 } });
  const noRate = parseLatency('Latency: 0 samples.');
  assert.equal(noRate.latency, undefined);
  assert.deepEqual(noRate.latencyInfo.values, [{ value: 0, unit: 'samples' }]);
  assert.equal(noRate.latencyInfo.sampleRate, null);
  const unrelatedRate = parseLatency('Latency: 0 samples; a preset is recommended at 48 kHz.');
  assert.equal(unrelatedRate.latency, undefined);
  assert.equal(unrelatedRate.latencyInfo.sampleRate, null);
  assert.equal(parseLatency('Latency: 0 samples at 48 kHz in a special mode.').latency, undefined);
  assert.deepEqual(parseLatency('Latency: 128 samples at 96 kHz.').latency, { 96: { samples: 128 } });
});

test('des modes explicites et une mesure à 96 kHz restent distincts d’une annonce ZL', () => {
  const text = 'This plugin has zero latency. 64 samples Live / 512 samples Studio at 48 kHz. Latency: 128 samples at 96 kHz.';
  const result = parseLatency(text);
  assert.deepEqual(result.latency[48].variants.map(({ label, samples }) => ({ label, samples })),
    [{ label: 'Live', samples: 64 }, { label: 'Studio', samples: 512 }]);
  assert.ok(result.latency[48].variants.every(mode => mode.excerpt.includes('48 kHz')));
  assert.equal(result.latency[48].samples, null);
  assert.equal(result.latency[96].samples, 128);
  const announcement = result.latencyInfo.reports.find(report => report.zero);
  assert.ok(announcement);
  assert.deepEqual(announcement.values, []);
  assert.equal(result.latencyInfo.conditional, true);
  assert.deepEqual(parseLatency(text), result);
  const unscopedMode = parseLatency('64 samples Live at 48 kHz / 512 samples Studio.');
  assert.equal(unscopedMode.latency, undefined);
  assert.equal(unscopedMode.latencyInfo.sampleRate, null);
});
