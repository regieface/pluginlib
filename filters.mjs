// Les valeurs cochées se combinent avec OU dans un critère, puis ET entre critères.
// Une exclusion l'emporte toujours, y compris pour un plugin multiplateforme.
export const emptySelection = () => ({ include: [], exclude: [] });
export function defaultSelections(facetKeys = [], scope) {
  const selections = Object.fromEntries(['platform', 'catalogStatus', 'recordType', 'family', 'maker', 'option', ...facetKeys].map((key) => [key, emptySelection()]));
  if (scope !== 'owned' && scope !== 'archives') selections.catalogStatus.exclude = ['discontinued', 'superseded', 'upcoming'];
  selections.maker.exclude = ['Airwindows'];
  selections.recordType.exclude = ['instrument', 'bundle', 'application', 'module', 'hardware'];
  return selections;
}
export const availabilityGroup = scope => (scope === 'owned' || scope === 'archives') ? 'collection' : 'catalogue';

export function availabilityOnScopeChange(current, next, selection, saved, searching) {
  const from = availabilityGroup(current), to = availabilityGroup(next);
  if (from === to) return selection;
  // Un aller-retour pendant la recherche garde aussi le filtre Disponibilité.
  if (searching && [current, next].every(scope => scope === 'owned' || scope === 'all')) return selection;
  saved.set(from, selection);
  return saved.get(to) || defaultSelections([], next).catalogStatus;
}

export function changeSelection(selection, value, mode, enabled) {
  const next = { include: selection.include.filter((v) => v !== value), exclude: selection.exclude.filter((v) => v !== value) };
  if (enabled) next[mode].push(value);
  return next;
}
export function matchesSelection(values, { include = [], exclude = [] } = {}) {
  if (values.some((value) => exclude.includes(value))) return false;
  return !include.length || values.some((value) => include.includes(value));
}
export function matchesPluginSelections(plugin, selections) {
  return Object.entries(selections).every(([key, selection]) => matchesSelection(valuesForFilter(plugin, key), selection));
}

export function valuesForFilter(plugin, key) {
  if (key === 'platform') return plugin.platforms?.length ? plugin.platforms : ['unknown'];
  if (key === 'catalogStatus') return [plugin.catalogStatus || 'unknown'];
  if (key === 'family') return [plugin.category];
  if (key === 'maker') return [plugin.vendor];
  if (key === 'recordType') return [plugin.recordType || 'unknown'];
  return (plugin.tags || []).filter((tag) => tag.startsWith(`${key === 'option' ? 'opt' : key}:`));
}

export function clearIrrelevantFacets(plugins, selections, facets) {
  const families = new Set(plugins.filter((p) => matchesSelection([p.category], selections.family)).map((p) => p.category));
  const cleared = [];
  for (const [key, definition] of Object.entries(facets)) {
    if (!definition.for.some((family) => families.has(family)) && (selections[key]?.include.length || selections[key]?.exclude.length)) {
      selections[key] = emptySelection(); cleared.push(key);
    }
  }
  return cleared;
}

export function contextualCounts(plugins, selections, key, facets) {
  // Ignorer le critère lui-même permet toujours d'ajouter un choix avec OU.
  // La famille reste modifiable même si un ancien critère technique est actif.
  const ignored = new Set(key === 'family' ? ['family', ...Object.keys(facets)] : [key]);
  const other = Object.fromEntries(Object.entries(selections).filter(([id]) => !ignored.has(id)));
  const counts = new Map();
  for (const p of plugins) {
    if (!matchesPluginSelections(p, other) || (facets[key] && !facets[key].for.includes(p.category))) continue;
    for (const value of new Set(valuesForFilter(p, key))) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
}
