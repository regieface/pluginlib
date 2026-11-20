import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteRack2Metadata } from '../lprep/lprep-rack2-native.mjs';
import { readRack2Project } from '../lprep/lprep-rack2-reader.mjs';

// Fichiers synthétiques. Aucun projet ou état de plugin du spectacle n'est distribué.
const text = new TextEncoder();
const concat = (...parts) => {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) { result.set(part, at); at += part.length; }
  return result;
};
const cstr = str => concat(text.encode(str), Uint8Array.of(0));
function cint(value) {
  if (!value) return Uint8Array.of(0);
  const parts = [];
  while (value > 0) { parts.push(value & 255); value = Math.floor(value / 256); }
  return Uint8Array.of(parts.length, ...parts);
}
const id = h => ({ id: h });
const opaque = bytes => ({ opaque: bytes });
function variant(value) {
  let payload;
  if (typeof value === 'number') {
    payload = Uint8Array.of(1, ...new Uint8Array(new Int32Array([value]).buffer));
  } else if (typeof value === 'string') payload = concat(Uint8Array.of(5), cstr(value));
  else if (value && value.id) payload = Uint8Array.of(6, ...Uint8Array.from(value.id.match(/../g).map(h => parseInt(h, 16))));
  else if (value && value.opaque) payload = concat(Uint8Array.of(8), value.opaque);
  else if (typeof value === 'boolean') payload = Uint8Array.of(value ? 4 : 3);
  else throw new Error('fixture invalide');
  return concat(cint(payload.length), payload);
}
const tree = (name, props = {}, kids = []) => concat(cstr(name), cint(Object.keys(props).length),
  ...Object.entries(props).flatMap(([key, value]) => [cstr(key), variant(value)]), cint(kids.length), ...kids);
const ids = ['1100000000000000', '2200000000000000'];
const names = ['KICK', 'OH'];
const colors = ['ffff337b', 'ff0066cc'];
const widths = [1, 2];
function fixture({ mismatch = false, plugins = true, version = '2026.1.0' } = {}) {
  const chunk = Uint8Array.from({ length: 3000 }, (_, i) => (i * 73 + 11) % 256);
  const chains = ids.map((sourceId, i) => tree('Chain', { ChainViewOrder: i }, [
    tree('ChainSettings', { ChainColour: colors[i], ChainInputCount: widths[i],
      ChainOutputCount: widths[i], ChainMainInputBusConfig: i ? 'L R' : 'C',
      ChainMainOutputBusConfig: i ? 'L R' : 'C' }, [tree('ProcessorSettingsContainer', { name: names[i], id: id(sourceId) })]),
    tree('ChainPlugins', {}, plugins && i === 0 ? [tree('Plugin', {
      pluginTypeName: 'F6 (m)', pluginTypeId: 'AudioUnit-F6-test', pluginUid: id('3300000000000000')
    }, [tree('PrivateBlob', { state: opaque(chunk) })])] : [])
  ]));
  const snapshots = ids.map((sourceId, i) => tree('Chain', {
    ChainId: id(sourceId), ChainColour: colors[i], CurrentSnapshot: 0
  }, [tree('ProcessorSettingsContainer', {
    name: mismatch && i === 0 ? 'OTHER' : names[i], id: id(sourceId)
  })]));
  const patch = [tree('outputs', {}, [tree('point', {
    outputNodeId: id('0100000000000000'), outputChannelId: 0,
    inputNodeId: id(ids[0]), inputChannelId: 0, isMidi: false
  })]), tree('outputs', {}, [tree('point', {
    outputNodeId: id(ids[0]), outputChannelId: 0,
    inputNodeId: id('0200000000000000'), inputChannelId: 0, isMidi: false
  })])];
  return tree('LiveProfessorProjectFile', { ProjectFileVersion: 1, appVersion: version }, [
    tree('AudioMidiHardware', {}, [tree('IOdeviceProperties', { RequiredInputs: 32, RequiredOutputs: 32 })]),
    tree('Chains', {}, chains),
    tree('GlobalSnapshot', {}, [tree('Chains', {}, snapshots), tree('AudioPatch', {}, patch)])
  ]);
}

test('sans modification, le .rack2 est identique octet par octet, y compris le blob opaque', () => {
  for (const original of [fixture(), fixture({ plugins: false })]) {
    const result = rewriteRack2Metadata(original);
    assert.deepEqual(result, original);
    assert.notStrictEqual(result, original);
  }
});
test('nom UTF-8, couleur et ordre modifiés aux deux emplacements, sans toucher au patch ni aux plugins', () => {
  const original = fixture();
  const before = readRack2Project(original);
  const revised = rewriteRack2Metadata(original, [
    { id: ids[0], name: 'GROSSE CAISSE 🎶', color: '#a42f3d', order: 1 },
    { id: ids[1], name: 'OH – Stéréo', color: '#378cb9', order: 0 }
  ]);
  const after = readRack2Project(revised);
  assert.deepEqual(after.chains.map(c => c.name), ['OH – Stéréo', 'GROSSE CAISSE 🎶']);
  assert.deepEqual(after.chains.map(c => c.color), ['#378cb9', '#a42f3d']);
  assert.deepEqual(after.connections, before.connections);
  assert.deepEqual(after.chains.find(c => c.id === ids[0]).plugins, before.chains.find(c => c.id === ids[0]).plugins);
  // Revenir aux noms/couleurs/rangs d'origine doit reconstituer chaque octet.
  const restored = rewriteRack2Metadata(revised, before.chains.map(c => ({
    id: c.id, name: c.name, color: c.color, order: c.order
  })));
  assert.deepEqual(restored, original);
  assert.deepEqual(rewriteRack2Metadata(original), original, 'source non modifiée');
});
test('un nom invalide, un ordre ambigu et une couleur incorrecte bloquent intégralement', () => {
  const original = fixture(), preserved = original.slice();
  assert.throws(() => rewriteRack2Metadata(original, [{ id: ids[0], name: 'INV\u0000ALIDE' }]), /refusée/);
  assert.throws(() => rewriteRack2Metadata(original, [{ id: ids[0], name: '' }]), /refusée/);
  assert.throws(() => rewriteRack2Metadata(original, [{ id: ids[0], color: '#12345' }]), /refusée/);
  assert.throws(() => rewriteRack2Metadata(original, [{ id: ids[0], order: 1 }]), /ordres de chaînes en conflit/);
  assert.throws(() => rewriteRack2Metadata(original, [{ id: 'ffffffffffffffff', name: 'TEST' }]), /chaîne absente/);
  assert.throws(() => rewriteRack2Metadata(original, [{ id: ids[0], plugins: [] }]), /champ de modification/);
  assert.deepEqual(original, preserved);
});
test('une divergence des snapshots ou une version non testée interdit la réécriture', () => {
  assert.throws(() => rewriteRack2Metadata(fixture({ mismatch: true }), [{ id: ids[0], name: 'NEW' }]), /divergence/);
  assert.throws(() => rewriteRack2Metadata(fixture({ version: '2027.1.0' })), /version de LiveProfessor/);
  assert.throws(() => rewriteRack2Metadata(fixture().subarray(0, 120)), /tronqué|texte non terminé/);
});

// Espace de travail natif : aucune conversion en projet JSON et copie seulement.
const { Rack2Workspace } = await import('../lprep/lprep-rack2-workspace.mjs');

test('mode constructeur natif : lecture des chaînes, formats, patch et plugin AU sans mutation', () => {
  const original = fixture();
  const preserved = original.slice();
  const ws = new Rack2Workspace(original, 'MIX.rack2');
  assert.equal(ws.fileName, 'MIX.rack2');
  assert.equal(ws.summary.pluginCount, 1);
  assert.equal(ws.summary.totalConnections, 2);
  assert.deepEqual(ws.chains.map(c => c.name), ['KICK', 'OH']);
  assert.deepEqual(ws.chains.map(c => c.inputFormat), ['mono', 'stereo']);
  assert.deepEqual(ws.chains[0].inputs, [1]);
  assert.equal(ws.chains[0].plugins[0].format, 'AU');
  assert.equal(ws.dirty, false);
  assert.deepEqual(ws.toRack2Copy(), original);
  assert.deepEqual(original, preserved);
});

test('mode constructeur natif : renommer, recolorer et réordonner garde plugin et patch', () => {
  const original = fixture(), ws = new Rack2Workspace(original, 'ORIGINAL.rack2');
  const originalGraph = readRack2Project(original);
  ws.rename(ids[0], 'Grosse caisse');
  ws.recolor(ids[0], '#A42F3D');
  assert.equal(ws.move(ids[1], -1), true);
  assert.equal(ws.move(ids[1], -1), false);
  assert.equal(ws.dirty, true);
  const updated = readRack2Project(ws.toRack2Copy());
  assert.deepEqual(updated.chains.map(c => c.name), ['OH', 'Grosse caisse']);
  assert.equal(updated.chains[1].color, '#a42f3d');
  assert.deepEqual(updated.connections, originalGraph.connections);
  assert.deepEqual(updated.chains[1].plugins, originalGraph.chains[0].plugins);
  assert.deepEqual(original, fixture());
  ws.reset();
  assert.equal(ws.dirty, false);
  assert.deepEqual(ws.toRack2Copy(), original);
});

test('mode constructeur natif : contrôle strict des valeurs et protection contre mutations externes', () => {
  const original = fixture(), ws = new Rack2Workspace(original, 'LIVE.rack2');
  assert.throws(() => ws.rename(ids[0], ''), /Nom de chaîne/);
  assert.throws(() => ws.rename(ids[0], 'T\u0000EST'), /Nom de chaîne/);
  assert.throws(() => ws.recolor(ids[0], 'red'), /Couleur hexadécimale/);
  assert.throws(() => ws.move(ids[0], 2), /Déplacement non autorisé/);
  assert.throws(() => ws.rename('ffffffffffffffff', 'TEST'), /introuvable/);
  const visible = ws.chains;
  visible[0].plugins.length = 0;
  visible[0].inputs.push(200);
  visible[0].name = 'HACK';
  original[0] = 0; // Modifier le tampon fourni ne change pas le fichier conservé en mémoire.
  assert.deepEqual(ws.toRack2Copy(), fixture());
  assert.equal(ws.dirty, false);
});

test('mode constructeur natif : toute version LiveProfessor non testée est verrouillée', () => {
  assert.throws(() => new Rack2Workspace(fixture({version:'2027.0.0'}), 'X.rack2'), /non encore testée/);
  assert.throws(() => new Rack2Workspace(fixture(), 'X.json'), /Fichier .rack2 attendu/);
  assert.throws(() => new Rack2Workspace(new Uint8Array([1,2,3]), 'X.rack2'), /non pris en charge/);
});


test('glisser-déposer dans le constructeur natif : ordre visuel et retour exact sans perte des états AU', () => {
  const original = fixture();
  const ws = new Rack2Workspace(original, 'LIVE.rack2');
  const initial = ws.chains.map(chain => chain.id);
  assert.equal(ws.moveBefore(initial[0], null), true, 'KICK déplacé après OH');
  assert.deepEqual(ws.chains.map(chain => chain.id), [initial[1], initial[0]]);
  assert.equal(ws.dirty, true);
  assert.equal(ws.moveBefore(initial[0], null), false, 'déplacement identique sans effet');
  assert.throws(() => ws.moveBefore(initial[0], 'ffffffffffffffff'), /cible native introuvable/);
  const exported = ws.toRack2Copy();
  assert.deepEqual(readRack2Project(exported).chains.map(chain => chain.id), [initial[1], initial[0]]);
  assert.equal(ws.moveBefore(initial[0], initial[1]), true, 'retour à la place initiale');
  assert.equal(ws.dirty, false);
  assert.deepEqual(ws.toRack2Copy(), original);
});

test('S2 patch : rerouter une destination existante puis restaurer tous les octets', async () => {
  const { rewriteRack2PatchDestinations } = await import('../lprep/lprep-rack2-native.mjs');
  const original = fixture(), preserved = original.slice();
  assert.deepEqual(rewriteRack2PatchDestinations(original), original);
  const change = {
    fromId: ids[0], fromChannel: 1,
    toId: '0200000000000000', toChannel: 1,
    nextToId: '0200000000000000', nextToChannel: 2
  };
  const updated = rewriteRack2PatchDestinations(original, [change]);
  assert.equal(updated.length, original.length);
  assert.deepEqual(readRack2Project(updated).connections[1], {
    fromId: ids[0], fromChannel: 1, toId: '0200000000000000', toChannel: 2
  });
  assert.deepEqual(readRack2Project(updated).chains[0].plugins,
    readRack2Project(original).chains[0].plugins);
  assert.deepEqual(original, preserved, 'le tampon source reste intact');
  const restored = rewriteRack2PatchDestinations(updated, [{
    ...change, toChannel: 2, nextToChannel: 1
  }]);
  assert.deepEqual(restored, original, 'aller-retour octet par octet');
});

test('S2 patch : changer le destinataire d’une connexion existante sans toucher aux plugins', async () => {
  const { rewriteRack2PatchDestinations } = await import('../lprep/lprep-rack2-native.mjs');
  const original = fixture();
  const changed = rewriteRack2PatchDestinations(original, [{
    fromId: '0100000000000000', fromChannel: 1,
    toId: ids[0], toChannel: 1,
    nextToId: ids[1], nextToChannel: 2
  }]);
  const read = readRack2Project(changed);
  assert.deepEqual(read.connections[0], {
    fromId: '0100000000000000', fromChannel: 1, toId: ids[1], toChannel: 2
  });
  assert.deepEqual(read.chains.find(c => c.id === ids[0]).plugins,
    readRack2Project(original).chains.find(c => c.id === ids[0]).plugins);
  assert.deepEqual(readRack2Project(original).connections[0], {
    fromId: '0100000000000000', fromChannel: 1, toId: ids[0], toChannel: 1
  });
});

test('S2 patch : versions, canaux, destinations inconnues et reroutages ambigus bloqués', async () => {
  const { rewriteRack2PatchDestinations } = await import('../lprep/lprep-rack2-native.mjs');
  const original = fixture(), intact = original.slice();
  const change = {
    fromId: ids[0], fromChannel: 1,
    toId: '0200000000000000', toChannel: 1,
    nextToId: '0200000000000000', nextToChannel: 2
  };
  assert.throws(() => rewriteRack2PatchDestinations(original, [{ ...change, nextToChannel: 33 }]), /limites/);
  assert.throws(() => rewriteRack2PatchDestinations(original, [{ ...change, nextToChannel: 0 }]), /mal formé/);
  assert.throws(() => rewriteRack2PatchDestinations(original, [{ ...change, nextToId: 'ffffffffffffffff' }]), /destination/);
  assert.throws(() => rewriteRack2PatchDestinations(original, [{ ...change, toChannel: 9 }]), /introuvable/);
  assert.throws(() => rewriteRack2PatchDestinations(original, [change, change]), /plusieurs fois/);
  assert.throws(() => rewriteRack2PatchDestinations(original, [{ ...change, unexpected: true }]), /mal formé/);
  assert.throws(() => rewriteRack2PatchDestinations(fixture({ version: '2027.1.0' }), [change]), /version/);
  assert.deepEqual(original, intact);
});
