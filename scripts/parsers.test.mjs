// Tests des analyseurs sur des extraits construits pour l'occasion (node --test scripts/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWavesLatency, matchWaves, parseCell } from './waves.mjs';
import { extractPage, parseSitemap } from './parse.mjs';
import { classify, isOutOfScope } from './classify.mjs';

test('latences Waves : JSON embarqué', () => {
  const html = `<p>Please view on desktop</p>{"latency":[{"documentName":"Abbey Road Chambers","native44":"101","native48":"101","native88":"33","native96":"33"},{"documentName":"Curves Equator","native48":"Curves Equator: 1087 samples<br>Curves Equator Live: 0 samples","native96":"Curves Equator: 2175 samples<br>Curves Equator Live: 0 samples"},{"documentName":"CLA-76 Compressor / Limiter","native48":"0","native96":"0"}]}`;
  const rows = parseWavesLatency(html);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].latency[48], { samples: 101 });
  assert.equal(rows[1].latency[48].samples, null);
  assert.deepEqual(rows[1].latency[48].variants, [{ label: 'Curves Equator', samples: 1087 }, { label: 'Curves Equator Live', samples: 0 }]);
  const prods = [{ name: 'CLA-76 Compressor / Limiter' }, { name: 'Curves Equator' }, { name: 'Renaissance Vox' }];
  const { matched, orphans } = matchWaves(prods, rows);
  assert.equal(matched, 2);
  assert.equal(orphans[0].name, 'Abbey Road Chambers');
  assert.deepEqual(prods[0].latency[96], { samples: 0 });
});

test('cellule ambiguë : pas de nombre inventé', () => {
  const c = parseCell('800-1500 samples, depending on sample rate');
  assert.equal(c.samples, null);
  assert.ok(c.note.includes('800-1500'));
});

test('page produit : OpenGraph + JSON-LD', () => {
  const html = `<html><head><title>Arousor | Empirical Labs</title><meta property="og:title" content="Arousor &amp; Co | Empirical Labs"><meta property="og:image" content="/img/arousor.png"><meta name="description" content="Compressor with fast attack and sidechain."><link rel="canonical" href="https://x.com/product/arousor/"><script type="application/ld+json">{"@type":"Product","name":"Arousor"}</script></head><body><main>FET style</main></body></html>`;
  const p = extractPage(html, 'https://x.com/product/arousor/');
  assert.equal(p.name, 'Arousor');
  assert.equal(p.image, 'https://x.com/img/arousor.png');
  assert.equal(p.canonical, 'https://x.com/product/arousor/');
  assert.ok(p.isProduct);
});

test('sitemap index et urlset', () => {
  const s = parseSitemap('<sitemapindex><sitemap><loc>https://a/p.xml</loc></sitemap></sitemapindex><urlset><url><loc>https://a/x</loc></url></urlset>');
  assert.deepEqual(s, { sitemaps: ['https://a/p.xml'], locs: ['https://a/x'] });
});

test('classement contextuel', () => {
  const c = classify({ name: 'CLA-76 Compressor / Limiter', text: 'FET compressor with ultra-fast attack. External sidechain.' });
  assert.equal(c.category, 'comp');
  assert.ok(c.tags.includes('techno:fet'));
  assert.ok(c.tags.includes('opt:sidechain'));
  const e = classify({ name: 'Pro-Q 4', text: 'Dynamic EQ with linear phase mode and mid/side' });
  assert.equal(e.category, 'eq');
  assert.ok(e.tags.includes('eqtype:dynamique') && e.tags.includes('eqtype:linphase'));
  assert.ok(!e.tags.some((t) => t.startsWith('techno:')));
  assert.ok(isOutOfScope('Analog Lab V Synthesizer')); assert.ok(isOutOfScope('Reverb Plugins')); assert.ok(isOutOfScope('KStrip | Free Trial'));
  assert.ok(!isOutOfScope('SSL Bus Compressor'));
});

test('visuel : attributs sans guillemets et capture GUI préférée (structure Waves)', () => {
  const html = `<head><meta property=og:image content=https://media.wavescdn.com/images/products/plugins/share/cla-echosphere.jpg><link rel=canonical href=https://www.waves.com/plugins/cla-echosphere></head><main><img src="https://media.wavescdn.com/images/products/plugins/hero/cla-echosphere.png?fit=max" alt="CLA EchoSphere main banner"><img src="https://media.wavescdn.com/images/products/plugins/max/cla-echosphere.png?h=300" alt="CLA EchoSphere main image"><img src="/logo.svg"></main>`;
  const p = extractPage(html, 'https://www.waves.com/plugins/cla-echosphere', 'Waves');
  assert.equal(p.image, 'https://media.wavescdn.com/images/products/plugins/max/cla-echosphere.png?h=300');
  assert.equal(p.canonical, 'https://www.waves.com/plugins/cla-echosphere');
});

test('visuel : page sans og:image (structure Arturia)', () => {
  const html = `<main><img src="https://medias.arturia.net/images/products/comp-fet76/content-1.jpg" class="w-100"><img src="https://medias.arturia.net/images/products/fx-collection-6/fx-collection-pro.png"></main>`;
  const p = extractPage(html, 'https://www.arturia.com/products/software-effects/comp-fet76/overview', 'Arturia');
  assert.equal(p.image, 'https://medias.arturia.net/images/products/comp-fet76/content-1.jpg');
});
