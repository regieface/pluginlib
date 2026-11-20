import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LPrepUIController } from '../lprep/lprep-ui-controller.mjs';
import { createSequentialIdFactory } from '../lprep/lprep-identifiers.mjs';
import { editableAutomaticPatchFormatPorts } from '../lprep/lprep-chain-edits.mjs';
import { validateProject } from '../lprep/lprep-project.mjs';

const setup = id => {
  const c = new LPrepUIController({ idFactory: createSequentialIdFactory(`review-${id}`) });
  c.createProject('test');
  return c;
};
const format = (c,id) => { const x = c.activeSession.chains.find(c=>c.chainId===id); return [x.inputFormat, x.outputFormat]; };
function patch(c) {
  const proposal = c.proposePatch();
  assert.equal(proposal.valid, true, JSON.stringify(proposal.issues));
  assert.equal(c.applyPatch().status, 'committed');
}
const nums = (c,chainId,direction) => c.activeSession.patchAssignments.find(a=>a.chainId===chainId && a.direction===direction)?.resourceRefs.map(ref=>Number(ref.split(':').at(-1)));


test('rôles FX/Monitoring : nouvelles chaînes colorées par défaut', () => {
  const c = setup('color');
  c.createChain({role:'fx',name:'FX1'});
  c.createChain({role:'monitoring',name:'MON'});
  assert.deepEqual(c.activeSession.chains.map(x=>x.color),['#f95ad8','#00c4a1']);
});

test('changement stéréo vers mono après AutoPatch atomique et Undo/Redo', () => {
  const c = setup('auto');
  c.createChain({name:'BASS',role:'insert'});
  c.createChain({name:'FX1',role:'fx'});
  patch(c);
  const first=c.activeSession.chains[0].chainId;
  assert.equal(editableAutomaticPatchFormatPorts(c.activeSession,c.activeSession.chains[0]).length,2);
  assert.deepEqual(nums(c,first,'input'),[1,2]);
  const change=c.updateChainSettings(first,{name:'BASS MONO',inputFormat:'mono',outputFormat:'mono',dlNumber:2});
  assert.equal(change.status,'committed',JSON.stringify(change.diagnostics));
  assert.deepEqual(format(c,first),['mono','mono']);
  assert.deepEqual(nums(c,first,'input'),[1]);
  assert.deepEqual(nums(c,first,'output'),[1]);
  assert.deepEqual(nums(c,c.activeSession.chains[1].chainId,'input'),[3,4]);
  assert.equal(c.activeSession.chains[0].name,'BASS MONO');
  assert.equal(c.activeSession.compensationGroups.find(g=>g.compensationGroupId===c.activeSession.chains[0].compensationGroupId)?.metadata?.dlNumber,2);
  assert.deepEqual(validateProject(c.project).filter(x=>x.severity==='error'),[]);
  assert.equal(c.undo().status,'undone');
  assert.deepEqual(format(c,first),['stereo','stereo']);
  assert.equal(c.redo().status,'redone');
  assert.deepEqual(format(c,first),['mono','mono']);
});

test('assignation verrouillée refuse changement sans mutation', () => {
  const c=setup('lock');c.createChain({role:'fx'});patch(c);
  const session=c.activeSession;
  session.patchAssignments[0].locked=true;
  assert.equal(c.openProject({...c.project,sessions:[session]}).status,'opened');
  const id=c.activeSession.chains[0].chainId;
  const before=structuredClone(c.activeSession);
  const r=c.updateChainSettings(id,{inputFormat:'mono'});
  assert.notEqual(r.status,'committed');
  assert.deepEqual(c.activeSession,before);
});

test('affectation modifiée manuellement refuse changement sans mutation', () => {
  const c=setup('manual');c.createChain({role:'insert'});patch(c);
  const session=c.activeSession;
  session.patchAssignments[0].origin='manual';
  assert.equal(c.openProject({...c.project,sessions:[session]}).status,'opened');
  const id=c.activeSession.chains[0].chainId;
  const before=structuredClone(c.activeSession);
  const r=c.updateChainSettings(id,{inputFormat:'mono'});
  assert.notEqual(r.status,'committed');
  assert.deepEqual(c.activeSession,before);
});

test('manque de capacité refuse changement et conserve patch', () => {
  const c=setup('capacity');
  c.createChain({role:'insert',inputFormat:'mono',outputFormat:'mono'});patch(c);
  const session=c.activeSession;
  for (const resource of session.environmentConfiguration.virtualResources) {
    if (resource.direction==='virtual-input' && resource.channelNumber>1) resource.availability='unavailable';
  }
  assert.equal(c.openProject({...c.project,sessions:[session]}).status,'opened');
  const id=c.activeSession.chains[0].chainId;
  const before=structuredClone(c.activeSession);
  const r=c.updateChainSettings(id,{inputFormat:'stereo'});
  assert.notEqual(r.status,'committed');
  assert.deepEqual(c.activeSession,before);
});

test('routage direct + clavier présents dans app',async()=>{
  const app=await readFile(new URL('../lprep/app.mjs',import.meta.url),'utf8');
  assert.match(app,/class="chain-settings-patch"/);
  assert.match(app,/openPatchEditor\(chain, button\)/);
  assert.match(app,/sessionDraftRows.addEventListener\('keydown'/);
  assert.match(app,/ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'/);
  assert.match(app,/compactResource/);
});
