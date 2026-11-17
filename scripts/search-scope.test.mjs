import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesCollectionScope } from '../collection.mjs';
import { availabilityOnScopeChange, changeSelection, defaultSelections, matchesPluginSelections } from '../filters.mjs';

test('élargir une recherche et revenir conserve les critères, y compris Disponibilité', () => {
  const saved = new Map();
  const selections = defaultSelections(['topology'], 'owned');
  selections.family = changeSelection(selections.family, 'compressor', 'include', true);
  selections.topology = changeSelection(selections.topology, 'topology:vca', 'include', true);
  selections.catalogStatus = changeSelection(selections.catalogStatus, 'discontinued', 'include', true);
  const original = structuredClone(selections);
  const card = { category: 'compressor', tags: ['topology:vca'], catalogStatus: 'discontinued' };
  const results = scope => ['owned', 'subscription', 'former', 'unknown'].filter(status =>
    matchesCollectionScope(status, scope) && matchesPluginSelections(card, selections));

  assert.deepEqual(results('owned'), ['owned', 'subscription']);
  selections.catalogStatus = availabilityOnScopeChange('owned', 'all', selections.catalogStatus, saved, true);
  assert.deepEqual(selections, original);
  assert.deepEqual(results('all'), ['owned', 'subscription', 'former', 'unknown']);
  selections.catalogStatus = availabilityOnScopeChange('all', 'owned', selections.catalogStatus, saved, true);
  assert.deepEqual(selections, original);
  assert.deepEqual(results('owned'), ['owned', 'subscription']);
});

test('les archives restent accessibles et la bibliothèque directe garde ses filtres par défaut', () => {
  const saved = new Map();
  const personal = defaultSelections([], 'owned').catalogStatus;
  const archives = availabilityOnScopeChange('owned', 'archives', personal, saved, true);
  assert.strictEqual(archives, personal);
  assert.deepEqual(['owned', 'subscription', 'former', 'unknown'].filter(status => matchesCollectionScope(status, 'archives')), ['former']);
  const library = availabilityOnScopeChange('archives', 'all', archives, saved, false);
  assert.deepEqual(library, defaultSelections().catalogStatus);
  assert.strictEqual(availabilityOnScopeChange('all', 'owned', library, saved, false), personal);
});
