import test from 'node:test';
import assert from 'node:assert/strict';
import { readRack2Project } from '../lprep/lprep-rack2-reader.mjs';

// Fixtures synthétiques : aucun état de plugin, licence ou projet personnel n'est distribué.
const encoder = new TextEncoder();
const concat = (...parts) => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) { bytes.set(part, cursor); cursor += part.length; }
  return bytes;
};
const cstring = value => concat(encoder.encode(value), Uint8Array.of(0));
function int(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('entier positif attendu');
  if (!value) return Uint8Array.of(0);
  const encoded = [];
  while (value) { encoded.push(value & 0xff); value = Math.floor(value / 256); }
  return Uint8Array.from([encoded.length, ...encoded]);
}
const id = hex => ({ id: hex });
const opaque = size => ({ chunk: size });
function variant(value) {
  let bytes;
  if (typeof value === 'number') {
    const data = new DataView(new ArrayBuffer(4));
    data.setInt32(0, value, true);
    bytes = concat(Uint8Array.of(1), new Uint8Array(data.buffer));
  } else if (typeof value === 'boolean') {
    bytes = Uint8Array.of(value ? 2 : 3);
  } else if (typeof value === 'string') {
    bytes = concat(Uint8Array.of(5), cstring(value));
  } else if (value?.id) {
    bytes = concat(Uint8Array.of(6), Uint8Array.from(value.id.match(/.{2}/g).map(pair => parseInt(pair, 16))));
  } else if (value?.chunk) {
    bytes = concat(Uint8Array.of(8), new Uint8Array(value.chunk));
  } else throw new Error('variant de test invalide');
  return concat(int(bytes.length), bytes);
}
const tree = (name, props = {}, children = []) => concat(
  cstring(name), int(Object.keys(props).length),
  ...Object.entries(props).flatMap(([key, value]) => [cstring(key), variant(value)]),
  int(children.length), ...children
);
const ids = ['1600000000000000', '1700000000000000', '1800000000000000', '1900000000000000'];
const inputId = '0100000000000000';
const outputId = '0200000000000000';
function model({ count = 4, patched = false, plugins = false, version = 1 } = {}) {
  const names = ['KICK', 'OH', 'BASS', 'FX REV'];
  const colors = ['ffff337b', 'ffff337b', 'ffff7b33', 'fff333ff'];
  const widths = [1, 2, 1, 2];
  const chainNodes = names.slice(0, count).map((name, index) => {
    const channels = widths[index];
    const typeId = index === 0 ? 'AudioUnit-F6 (m)-5319b30f-5b420463' : 'VST3-F6-RTA Stereo-10456661-52d55f75';
    const typeName = index === 0 ? 'F6 (m)' : 'F6-RTA Stereo';
    return tree('Chain', { ChainViewOrder: index }, [
      tree('ChainSettings', { ChainInputCount: channels, ChainOutputCount: channels,
        ChainMainInputBusConfig: channels === 1 ? 'C' : 'L R',
        ChainMainOutputBusConfig: channels === 1 ? 'C' : 'L R', ChainColour: colors[index] }, [
        tree('ProcessorSettingsContainer', { name, id: id(ids[index]) })
      ]),
      tree('ChainPlugins', {}, plugins && index < 2 ? [tree('Plugin', {
        pluginTypeId: typeId, pluginTypeName: typeName, pluginUid: id(ids[index].replace(/^../, '99'))
      }, [tree('Plugin', {}, [tree('PluginSnapshot', { chunkData: opaque(1024) })])])] : [])
    ]);
  });
  const patchPoints = [];
  const outputs = [];
  const inputs = [];
  const maps = [[1], [2, 3], [4], [5, 6]];
  for (let i = 0; i < count && patched; i++) {
    maps[i].forEach((channel, index) => {
      const inProps = {
        outputNodeId: id(inputId), outputChannelId: channel - 1,
        inputNodeId: id(ids[i]), inputChannelId: index, isMidi: false
      };
      const outProps = {
        outputNodeId: id(ids[i]), outputChannelId: index,
        inputNodeId: id(outputId), inputChannelId: channel - 1, isMidi: false
      };
      patchPoints.push(tree('outputs', { nodeId: id(inputId), channelId: channel - 1 }, [tree('point', inProps)]));
      patchPoints.push(tree('outputs', { nodeId: id(ids[i]), channelId: index }, [tree('point', outProps)]));
    });
  }
  const root = tree('LiveProfessorProjectFile', {
    ProjectFileVersion: version, appVersion: '2026.1.0'
  }, [
    tree('AudioMidiHardware', {}, [
      tree('IOdeviceProperties', { RequiredInputs: count ? 32 : 0, RequiredOutputs: count ? 32 : 0 })
    ]),
    tree('Chains', {}, chainNodes),
    tree('GlobalSnapshot', {}, [tree('AudioPatch', {}, patchPoints)])
  ]);
  return root;
}

test('le lecteur refuse les fichiers invalides, tronqués et les versions inconnues', () => {
  assert.throws(() => readRack2Project(new Uint8Array()), /non pris en charge/);
  assert.throws(() => readRack2Project(encoder.encode('{"project":"fake"}')), /non pris en charge/);
  assert.throws(() => readRack2Project(model({ version: 99 })), /version de fichier/);
  const data = model({ patched: true });
  assert.throws(() => readRack2Project(data.subarray(0, data.length - 25)), /non pris en charge/);
});

test('le projet vide et les 32 entrées/sorties sont identifiés sans modifier les octets', () => {
  const blank = model({ count: 0 });
  const copy = blank.slice();
  const result = readRack2Project(blank);
  assert.equal(result.chains.length, 0);
  assert.equal(result.inputCount, 0);
  assert.equal(result.outputCount, 0);
  assert.deepEqual(blank, copy);
  const withChains = readRack2Project(model());
  assert.equal(withChains.inputCount, 32);
  assert.equal(withChains.outputCount, 32);
});

test('noms, couleurs, ordre, formats et 12 points de patch correspondent aux quatre chaînes', () => {
  const result = readRack2Project(model({ patched: true }));
  assert.deepEqual(result.chains.map(chain => chain.name), ['KICK', 'OH', 'BASS', 'FX REV']);
  assert.deepEqual(result.chains.map(chain => [chain.inputFormat, chain.outputFormat]), [
    ['mono', 'mono'], ['stereo', 'stereo'], ['mono', 'mono'], ['stereo', 'stereo']
  ]);
  assert.deepEqual(result.chains.map(chain => chain.color), ['#ff337b', '#ff337b', '#ff7b33', '#f333ff']);
  assert.equal(result.totalConnections, 12);
  assert.deepEqual(result.chains.map(chain => [chain.inputs, chain.outputs]), [
    [[1], [1]], [[2, 3], [2, 3]], [[4], [4]], [[5, 6], [5, 6]]
  ]);
});

test('un plugin AU et un VST3 sont listés sans parcourir leurs chunks opaques', () => {
  const bytes = model({ patched: true, plugins: true });
  const copy = bytes.slice();
  const result = readRack2Project(bytes);
  assert.equal(result.pluginCount, 2);
  assert.deepEqual(result.chains.map(chain => chain.plugins.map(p => p.format)), [['AU'], ['VST3'], [], []]);
  assert.deepEqual(bytes, copy);
});
