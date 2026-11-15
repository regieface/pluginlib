import test from 'node:test';
import assert from 'node:assert/strict';
import { inferCatalogMetadata, matchesCatalogFilters, mergeVendorProducts } from '../catalog.mjs';
import { parseDownloadTable, parseLSP, parseChow, parseAirwindowsPosts } from './catalog-parsers.mjs';

test('vue initiale : toutes les plateformes ; le filtre macOS inclut les produits multiplateformes', () => {
  assert.equal(matchesCatalogFilters({ platforms: ['windows'], catalogStatus: 'commercial' }), true);
  assert.equal(matchesCatalogFilters({ platforms: ['windows'], catalogStatus: 'commercial' }, 'macos'), false);
  assert.equal(matchesCatalogFilters({ platforms: ['macos'], catalogStatus: 'commercial' }), true);
  assert.equal(matchesCatalogFilters({ platforms: ['macos', 'windows', 'linux'], catalogStatus: 'commercial' }), true);
  assert.equal(matchesCatalogFilters({ platforms: ['macos'], catalogStatus: 'discontinued' }), false);
  assert.equal(matchesCatalogFilters({ catalogStatus: 'commercial' }), true);
  assert.equal(matchesCatalogFilters({ catalogStatus: 'commercial' }, 'macos'), false);
  assert.equal(matchesCatalogFilters({ platforms: ['macos'] }), true);
});

test('tous les systèmes, Linux, inconnus et abandonnés restent consultables', () => {
  assert.equal(matchesCatalogFilters({}, 'unknown', 'all'), true);
  assert.equal(matchesCatalogFilters({ platforms: ['linux'] }, 'unknown', 'all'), false);
  assert.equal(matchesCatalogFilters({ platforms: ['linux'], catalogStatus: 'free' }, 'linux', 'free'), true);
  assert.equal(matchesCatalogFilters({ platforms: ['windows'], catalogStatus: 'discontinued' }, 'all', 'discontinued'), true);
});

test('compatibilité : uniquement les plateformes annoncées, sans déduire Mac du format VST', () => {
  assert.deepEqual(inferCatalogMetadata({ text: 'VST3 and AAX plugin.' }).platforms, []);
  assert.deepEqual(inferCatalogMetadata({ operatingSystem: 'macOS 12, Windows 10, Linux' }).platforms, ['macos', 'windows', 'linux']);
  assert.deepEqual(inferCatalogMetadata({ text: 'Windows only. Linux is not supported.' }).platforms, ['windows']);
  assert.deepEqual(inferCatalogMetadata({ text: 'Buy now. Windows 11 and macOS.' }).platforms, ['macos', 'windows']);
});

test('disponibilité : essai gratuit et absence de prix ne valent pas gratuit ou abandon', () => {
  assert.equal(inferCatalogMetadata({ text: 'Free trial, 14 days.', price: 0, listed: true }).catalogStatus, 'unknown');
  assert.equal(inferCatalogMetadata({ text: '', listed: false }).catalogStatus, 'unknown');
  assert.equal(inferCatalogMetadata({ text: 'This plugin has been discontinued.' }).catalogStatus, 'discontinued');
  assert.equal(inferCatalogMetadata({ text: 'General support - discontinued Windows 7 support. Buy now.', listed: true }).catalogStatus, 'commercial');
  assert.equal(inferCatalogMetadata({ text: 'Freeware plugin', listed: true }).catalogStatus, 'free');
  assert.equal(inferCatalogMetadata({ price: 49, listed: true }).catalogStatus, 'commercial');
  assert.equal(inferCatalogMetadata({ text: 'Get our free plugin', price: 49, listed: true }).catalogStatus, 'commercial');
});

test('collecte partielle : conserver anciennes fiches, latences et identifiants personnels', () => {
  const old = [{ id: 'v--old-name', url: 'https://v.com/product/', platforms: ['macos'], catalogStatus: 'commercial', latency: { 48: { samples: 0 } } }, { id: 'v--missing', name: 'Missing' }];
  const merged = mergeVendorProducts(old, [{ id: 'v--new-name', url: 'https://v.com/product', platforms: [], catalogStatus: 'unknown' }]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'v--old-name');
  assert.deepEqual(merged[0].platforms, ['macos']);
  assert.equal(merged[0].catalogStatus, 'commercial');
  assert.equal(merged[0].latency[48].samples, 0);
});

test('une table partagée ne fusionne pas deux plugins différents', () => {
  const old = [{ id: 'a', url: 'https://v.com/downloads' }, { id: 'b', url: 'https://v.com/downloads' }];
  assert.equal(mergeVendorProducts(old, [{ id: 'c', url: 'https://v.com/downloads' }, { id: 'd', url: 'https://v.com/downloads' }]).length, 4);
});

test('table officielle : versions maintenues et produits explicitement abandonnés', () => {
  const html = '<h2>Latest Versions</h2><table><tr><td>Plug-In</td><td>Version</td></tr><tr><td>Free EQ</td><td>2.0</td><td>Updated Windows</td></tr></table><h2>Legacy / Discontinued</h2><table><tr><td>Old Verb</td><td>1.0</td><td></td></tr></table>';
  const parsed = parseDownloadTable(html, 'https://v.com/downloads/');
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].metadata.catalogStatus, 'free');
  assert.equal(parsed[1].metadata.catalogStatus, 'discontinued');
});

test('LSP : une fiche par famille, sans multiplier mono/stéréo', () => {
  const parsed = parseLSP('<a data-src="/ajax/bundle.php?bundle=comp"><img src="/comp.png"><div class="tile-name">Compressor</div></a>', 'https://lsp-plug.in/?page=plugins');
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].metadata.platforms, ['linux']);
  assert.equal(parsed[0].name, 'Compressor');
});

test('ChowDSP : plateformes par téléchargement, instruments exclus', () => {
  const body = '<h2>BYOD</h2><p>Distortion</p><a href="https://github.com/x/releases/download/v1/BYOD-Mac-1.dmg">Mac</a><h2>Chow Kick</h2><a href="https://github.com/x/releases/download/v1/Kick-Mac-1.dmg">Mac</a>';
  const parsed = parseChow(body, 'https://chowdsp.com/products.html');
  assert.equal(parsed.length, 1);
  assert.deepEqual(parsed[0].metadata.platforms, ['macos']);
});

test('Airwindows : ignorer actualités et compilations, exiger le binaire du produit', () => {
  const posts = [
    { title: { rendered: 'Tape' }, link: 'https://airwindows.com/tape/', content: { rendered: '<p>Tape saturation for Mac Windows Linux</p><a href="https://airwindows.com/wp-content/uploads/Tape.zip">download</a>' } },
    { title: { rendered: 'News' }, link: 'https://airwindows.com/news/', content: { rendered: '<a href="https://airwindows.com/wp-content/uploads/Tape.zip">download Tape</a>' } }
  ];
  assert.deepEqual(parseAirwindowsPosts(posts).map((p) => p.name), ['Tape']);
});
