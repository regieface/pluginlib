import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCatalogMetadata, matchesCatalogFilters, resolveReplacements, applyCatalogOverride } from '../catalog.mjs';
import { parseRetailerPricing, retailerProductMatches, findRetailerLinks } from './retailer-prices.mjs';

test('version remplacée : conserver une fiche distincte et masquer la version ancienne par défaut', () => {
  const facts = inferCatalogMetadata({ text: 'Please note this product has been replaced with the new SP2016 Reverb Plug-in', url: 'https://v.com/old' });
  assert.equal(facts.catalogStatus, 'superseded');
  assert.equal(facts.replacedBy.name, 'SP2016 Reverb');
  assert.equal(matchesCatalogFilters({ platforms: ['macos'], ...facts }), false);
  const data = resolveReplacements([{ id: 'old', vendor: 'Eventide', ...facts }, { id: 'new', vendor: 'Eventide', name: 'SP2016 Reverb', url: 'https://v.com/new' }]);
  assert.equal(data[0].replacedBy.id, 'new');
  assert.notEqual(data[0].id, data[1].id);
});

test('ne pas retirer un produit actuel parce qu’il décrit un composant remplacé ou annonce une sortie future', () => {
  assert.equal(inferCatalogMetadata({ text: 'The old circuit has been replaced by a better model.', price: 99, listed: true }).catalogStatus, 'commercial');
  assert.equal(inferCatalogMetadata({ text: 'A new version is coming November 17, 2026.', price: 99, listed: true }).catalogStatus, 'commercial');
});

test('une annonce datée ne force pas le statut à paraître après la date de sortie', () => {
  const override = { catalogStatus: 'upcoming', releaseDate: '2026-11-17' };
  assert.equal(applyCatalogOverride({ catalogStatus: 'commercial' }, override, '2026-11-15').catalogStatus, 'upcoming');
  assert.equal(applyCatalogOverride({ catalogStatus: 'commercial' }, override, '2026-11-18').catalogStatus, 'commercial');
  assert.equal(applyCatalogOverride({ catalogStatus: 'upcoming' }, override, '2026-11-18').catalogStatus, 'unknown');
});

const plugin = { name: 'SP2016 Reverb', vendor: 'Eventide' };
test('revendeur : même plugin, sans upgrade ni bundle ni autre édition', () => {
  assert.equal(retailerProductMatches(plugin, 'Eventide SP2016 Reverb – Thomann France'), true);
  assert.equal(retailerProductMatches(plugin, 'Eventide SP2016 Reverb Upgrade'), false);
  assert.equal(retailerProductMatches(plugin, 'Eventide SP2016 Reverb Bundle'), false);
  assert.equal(retailerProductMatches(plugin, 'Eventide 2016 Stereo Room'), false);
});

test('tarif Thomann : conserver la source, la devise et ne pas inventer de promotion', () => {
  const html = '<title>Eventide SP2016 Reverb – Thomann France</title><meta itemprop="price" content="39"><meta itemprop="priceCurrency" content="EUR">';
  const price = parseRetailerPricing(plugin, html, 'https://www.thomann.de/fr/eventide_sp2016_reverb.htm', 'Thomann');
  assert.equal(price.normal, 39);
  assert.equal(price.promo, null);
  assert.equal(price.currency, 'EUR');
  assert.equal(price.sourceName, 'Thomann');
  assert.equal(price.sourceType, 'retailer');
  assert.equal(parseRetailerPricing({ ...plugin, name: 'Blackhole' }, html, 'https://www.thomann.de/x.htm', 'Thomann'), null);
});

test('recherche marchand : ignorer les liens externes et les produits différents', () => {
  const html = '<a href="/fr/eventide_sp2016_reverb.htm">Eventide SP2016 Reverb</a><a href="https://other.com/product.htm">Eventide SP2016 Reverb</a><a href="/fr/bundle.htm">Eventide SP2016 Reverb Bundle</a>';
  assert.deepEqual(findRetailerLinks(plugin, html, 'https://www.thomann.de'), ['https://www.thomann.de/fr/eventide_sp2016_reverb.htm']);
});

test('promotion Thomann : le plus bas sur 30 jours ne devient pas le prix normal', () => {
  const html = '<title>Eventide SP2016 Reverb – Thomann France</title><meta itemprop="price" content="39"><meta itemprop="priceCurrency" content="EUR"><span class="strike-price-saving-percentage">-59%</span><span>Meilleur prix sur 30 jours: 95 €</span><link itemprop="availability" href="https://schema.org/InStock">';
  const price = parseRetailerPricing(plugin, html, 'https://www.thomann.de/fr/eventide_sp2016_reverb.htm', 'Thomann');
  assert.equal(price.normal, null);
  assert.equal(price.promo, 39);
  const fullPrice = html.replace(/<span class="strike-price-saving-percentage">[\s\S]*?<\/span>/, '');
  assert.equal(parseRetailerPricing(plugin, fullPrice + '<span class="strike-price-saving-percentage">-70%</span>', 'https://www.thomann.de/fr/x.htm', 'Thomann').normal, 39);
});
