import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { MemoryRevisionStore } from '../lprep/lprep-persistence.mjs';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';

function setup(suffix) {
  const store = new MemoryRevisionStore();
  const controller = new LPrepUIController({ revisionStore: store, idFactory: createSequentialIdFactory(`s3-${suffix}`) });
  controller.createProject('S3');
  return { controller, store };
}

test('le bouton + repose sur les trois rôles, les formats indépendants et les DLY attendus', () => {
  const { controller } = setup('create');
  const definitions = [
    ['insert', 'mono', 'mono'], ['fx', 'mono', 'stereo'],
    ['monitoring', 'stereo', 'mono'], ['insert', 'stereo', 'stereo']
  ];
  for (const [role, inputFormat, outputFormat] of definitions) {
    assert.equal(controller.createChain({ role, inputFormat, outputFormat }).status, 'committed');
  }
  assert.deepEqual(controller.activeSession.chains.map(chain => [chain.role, chain.inputFormat, chain.outputFormat]), definitions);
  const dl1 = controller.activeSession.compensationGroups.find(group => group.metadata.dlNumber === 1);
  assert.deepEqual(dl1.memberChainRefs, [controller.activeSession.chains[0].chainId, controller.activeSession.chains[3].chainId]);
  assert.ok(controller.activeSession.chains.slice(1, 3).every(chain => chain.compensationGroupId === null));
});

test('nom et formats du panneau gauche restent transactionnels avec Undo/Redo et sauvegarde', async () => {
  const { controller, store } = setup('edit');
  controller.createChain({ role: 'insert' });
  const chainId = controller.activeSession.chains[0].chainId;
  assert.equal(controller.renameChain(chainId, 'Voix').status, 'committed');
  assert.equal(controller.updateChainSettings(chainId, { inputFormat: 'mono', outputFormat: 'stereo' }).status, 'committed');
  assert.deepEqual([controller.activeSession.chains[0].name, controller.activeSession.chains[0].inputFormat,
    controller.activeSession.chains[0].outputFormat], ['Voix', 'mono', 'stereo']);
  assert.equal(controller.undo().status, 'undone'); assert.equal(controller.activeSession.chains[0].inputFormat, 'stereo');
  assert.equal(controller.redo().status, 'redone'); assert.equal(controller.activeSession.chains[0].inputFormat, 'mono');
  const saved = await controller.save(), reopened = new LPrepUIController({ revisionStore: store });
  await reopened.openRevision(saved.revisionId);
  assert.equal(reopened.activeSession.chains[0].name, 'Voix');
  assert.equal(reopened.activeSession.chains[0].outputFormat, 'stereo');
});

test('l’interface S3 expose le menu compact, les deux formats et l’édition directe du nom', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../lprep/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../lprep/app.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(html, /class="chain-create-menu"/);
  assert.match(html, /name="inputFormat"/); assert.match(html, /name="outputFormat"/);
  assert.match(app, /editChainName\(button, chain\)/);
  assert.match(app, /inputFormat: fields\.inputFormat\.value, outputFormat: fields\.outputFormat\.value/);
  assert.match(html, /id="create-session-dialog"/);
});
