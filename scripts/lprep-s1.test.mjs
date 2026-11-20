import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultEnvironmentProfile } from '../lprep/lprep-environment.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { applySessionChainCount, createSessionDraft, planSessionChainCount,
  sessionDraftCapacity, sessionDraftNeeds, validateSessionDraft } from '../lprep/lprep-session-draft.mjs';

const profile = createDefaultEnvironmentProfile();
const context = { machines: [], profiles: [profile], presets: [{ presetId: 'preset:test', revision: 1, name: 'Test' }] };
const idFactory = createSequentialIdFactory('s1');
const fresh = () => createSessionDraft({ idFactory, environmentProfileId: profile.environmentProfileId });

test('la fenêtre S1 est modale, stable et sépare en-tête, tableau défilant et pied', async () => {
  const [html, css, app] = await Promise.all([readFile(new URL('../lprep/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../lprep/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../lprep/app.mjs', import.meta.url), 'utf8')]);
  assert.match(html, /<dialog id="create-session-dialog"/);
  assert.match(html, /id="session-draft-rows"/);
  assert.match(html, /Nom de session/);
  assert.match(html, /Machine cible/);
  assert.match(html, /Profil d’environnement/);
  assert.match(html, /Créer la session/);
  assert.match(css, /#create-session-form[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(css, /\.session-chain-table-wrap[^}]*overflow-y: auto/);
  assert.match(app, /createSessionForm\.addEventListener\('input', event => updateSessionChainCount\(event\.target\)\)/);
  assert.match(app, /for \(const fieldName of sessionCountRoles\.keys\(\)\) updateSessionChainCount/);
});

test('les trois compteurs ajoutent des lignes groupées avec des identifiants temporaires stables', () => {
  let draft = fresh();
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'insert', 2, idFactory));
  const firstIds = draft.chains.map(chain => chain.draftChainId);
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'fx', 1, idFactory));
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'monitoring', 1, idFactory));
  assert.deepEqual(draft.counts, { insert: 2, fx: 1, monitoring: 1 });
  assert.deepEqual(draft.chains.slice(0, 2).map(chain => chain.draftChainId), firstIds);
  assert.deepEqual(draft.chains.map(chain => chain.role), ['insert', 'insert', 'fx', 'monitoring']);
});

test('le scénario 5 Inserts, 3 FX et 1 Monitoring synchronise lignes et capacité', () => {
  let draft = fresh();
  for (const [role, count] of [['insert', 5], ['fx', 3], ['monitoring', 1]]) {
    draft = applySessionChainCount(draft, planSessionChainCount(draft, role, count, idFactory));
  }
  assert.deepEqual(draft.counts, { insert: 5, fx: 3, monitoring: 1 });
  assert.deepEqual(draft.chains.map(chain => chain.role),
    ['insert', 'insert', 'insert', 'insert', 'insert', 'fx', 'fx', 'fx', 'monitoring']);
  assert.deepEqual(sessionDraftNeeds(draft), { inputs: 18, outputs: 18 });
  const broken = structuredClone(draft); broken.chains = [];
  assert.ok(validateSessionDraft(broken, context).some(issue => issue.code === 'session-draft.count-mismatch'));
});

test('une réduction vierge est directe et une ligne renseignée exige confirmation', () => {
  let draft = fresh();
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'insert', 2, idFactory));
  assert.equal(planSessionChainCount(draft, 'insert', 1, idFactory).confirmationRequired, false);
  draft.chains[1].name = 'Voix';
  const plan = planSessionChainCount(draft, 'insert', 1, idFactory);
  assert.equal(plan.confirmationRequired, true);
  assert.deepEqual(plan.changedDraftChainIds, [draft.chains[1].draftChainId]);
  assert.equal(draft.chains.length, 2); // annuler revient à ne pas appliquer le plan
});

test('zéro chaîne est valide mais les noms deviennent obligatoires dès leur ajout', () => {
  const draft = fresh(); draft.name = 'Session vide';
  assert.deepEqual(validateSessionDraft(draft, context), []);
  const withChain = applySessionChainCount(draft, planSessionChainCount(draft, 'fx', 1, idFactory));
  assert.ok(validateSessionDraft(withChain, context).some(issue => issue.code === 'session-draft.chain-name'));
});

test('formats, preset, couleur et DLY restent structurés et validés', () => {
  let draft = fresh(); draft.name = 'Session';
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'insert', 1, idFactory));
  Object.assign(draft.chains[0], { name: 'Basse', inputFormat: 'mono', outputFormat: 'stereo',
    presetRef: { presetId: 'preset:test', revision: 1 }, color: '#e25d3a', dlNumber: 2 });
  assert.deepEqual(validateSessionDraft(draft, context), []);
  assert.equal(draft.chains[0].inputFormat, 'mono'); assert.equal(draft.chains[0].outputFormat, 'stereo');
  draft.chains[0].dlNumber = 0;
  assert.ok(validateSessionDraft(draft, context).some(issue => issue.code === 'session-draft.dl'));
});

test('l’indicateur utilise le profil et avertit sans rendre le brouillon invalide', () => {
  let draft = fresh(); draft.name = 'Grande session'; draft.sampleRate = 96000;
  draft = applySessionChainCount(draft, planSessionChainCount(draft, 'insert', 17, idFactory));
  draft.chains.forEach((chain, index) => { chain.name = `Insert ${index + 1}`; });
  assert.deepEqual(sessionDraftCapacity(profile), { inputs: 32, outputs: 30 });
  assert.deepEqual(sessionDraftNeeds(draft), { inputs: 34, outputs: 34 });
  assert.deepEqual(validateSessionDraft(draft, context), []);
  draft.sampleRate = 48000;
  assert.deepEqual(validateSessionDraft(draft, context), []);
});
