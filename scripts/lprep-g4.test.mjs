import test from 'node:test';
import assert from 'node:assert/strict';
import { dropGeometry } from '../lprep/lprep-builder-interactions.mjs';
import { sessionRows } from '../lprep/lprep-catalog-view.mjs';

test('G4 inverse les axes des chaînes et des plugins, y compris les dépôts du catalogue', () => {
  const bounds = { left: 10, right: 110, top: 20, bottom: 100 };
  const upperRight = { clientX: 100, clientY: 25 };
  assert.deepEqual(dropGeometry('horizontal', 'chain', upperRight, bounds), { after: false, inside: true });
  assert.deepEqual(dropGeometry('vertical', 'chain', upperRight, bounds), { after: true, inside: true });
  for (const kind of ['plugin', 'catalog']) {
    assert.deepEqual(dropGeometry('horizontal', kind, upperRight, bounds), { after: true, inside: true });
    assert.deepEqual(dropGeometry('vertical', kind, upperRight, bounds), { after: false, inside: true });
    assert.deepEqual(dropGeometry('vertical', kind, { clientX: 50, clientY: 110 }, bounds), { after: true, inside: false });
  }
});

test('la présentation expose uniquement un bypass explicite sans modifier les préférences audio ni les couleurs', () => {
  const chain = { chainId: 'chain:one', color: '#D12F62', pluginOrder: ['instance:on', 'instance:off', 'instance:unknown'],
    presentationLinks: ['instance:ambiguous'] };
  const session = {
    chains: [chain], chainOrder: [chain.chainId], compensationGroups: [], audioGraph: { sampleRate: 48000 },
    pluginInstances: [
      { instanceId: 'instance:on', metadata: { bypassed: true } },
      { instanceId: 'instance:off', metadata: { bypassed: false } },
      { instanceId: 'instance:unknown' },
      { instanceId: 'instance:ambiguous', metadata: { bypassed: 'true' } }
    ]
  };
  const before = structuredClone(session);
  const [row] = sessionRows(session, new Map());
  assert.deepEqual(row.plugins.map(plugin => [plugin.id, plugin.bypassed]), [
    ['instance:on', true], ['instance:off', false], ['instance:unknown', false]
  ]);
  assert.equal(row.independent[0].bypassed, false);
  assert.equal(row.chain.color, '#D12F62');
  assert.deepEqual(session, before);
});
