import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const app = readFileSync(new URL('../lprep/app.mjs', import.meta.url), 'utf8');
const html = readFileSync(new URL('../lprep/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../lprep/styles.css', import.meta.url), 'utf8');

test('le .rack2 s’ouvre dans le VRAI constructeur et les panneaux L-Prep', () => {
  assert.match(html, /id="open-rack2-workspace"/);
  assert.match(html, /id="rack2-workspace"[^>]*hidden/);
  assert.doesNotMatch(html, /id="rack2-workspace-chains"/);
  assert.equal((html.match(/id="chain-list"/g) || []).length, 1);
  assert.match(app, /new Rack2Workspace\(rack2Native\.source, rack2Native\.fileName\)/);
  assert.match(app, /function renderRack2Workspace\(\)/);
  assert.ok(app.includes("const list = $('#chain-list'); // EXACTEMENT"));
  assert.match(app, /row\.className = 'chain-row'/);
  assert.match(app, /heading\.className = 'chain-heading'/);
  assert.match(app, /strip\.className = 'plugin-strip'/);
  assert.match(app, /if \(rack2Workspace\) \{ renderNativeSelection\(\); return; \}/);
  assert.match(app, /rack2Workspace\.toRack2Copy\(\)/);
  assert.match(css, /\.editor\.rack2-workspace-active #builder-content \{ display: contents !important; \}/);
  assert.doesNotMatch(css, /rack2-workspace-active > \.panel.*display:\s*none/);
});

test('le mode natif désactive les opérations JSON et interdit l’écrasement du fichier original', () => {
  assert.match(app, /if \(rack2Workspace\) \{ saveRack2WorkspaceCopy\(\); return; \}/);
  assert.match(app, /'new-project', 'rename-project', 'open-project', 'export-project'/);
  assert.match(app, /'demo-project', 'target-machine', 'sample-rate', 'undo', 'redo'/);
  assert.match(html, /L’enregistrement télécharge uniquement une nouvelle copie \.rack2, jamais l’original/);
  assert.doesNotMatch(app, /fileHandle\.createWritable|showSaveFilePicker|writeFileSync\(/);
});

test('les événements natifs et leurs patchs opaques ne touchent pas au modèle JSON', () => {
  assert.match(app, /nativeApplyChange\(\(\) => rack2Workspace\.moveBefore\(chainId, beforeId\)\)/);
  assert.match(app, /'#plugin-library'\)\.inert = open/);
  assert.match(app, /#add-chain-menu/);
  assert.match(app, /function nativePatchIndicator\(chain\)/);
  assert.match(app, /function nativePluginTile\(plugin\)/);
  assert.match(app, /rack2Workspace\.rename\(chain\.id,/);
  assert.match(app, /rack2Workspace\.recolor\(chain\.id,/);
  assert.match(app, /rack2Workspace\.move\(chain\.id,/);
  assert.doesNotMatch(app, /fileHandle\.createWritable|showSaveFilePicker|writeFileSync\(/);
});


test('mode natif : glisser-déposer des chaînes et renommage direct réutilisent les interactions standard', () => {
  assert.match(app, /startDrag\(select, \{ kind: 'chain', chainId: chain\.id, label: chain\.name \}\)/);
  assert.match(app, /select\.ondblclick = \(\) => editChainName\(select, chain\)/);
  assert.match(app, /event\.key === 'F2'.*editChainName\(select, chain\)/);
  assert.match(app, /rack2Workspace\.rename\(chain\.id, name\)/);
  assert.match(app, /rack2Workspace\.moveBefore\(chainId, beforeId\)/);
  assert.doesNotMatch(app, /rack2Workspace\.removePlugin\(/);
});
