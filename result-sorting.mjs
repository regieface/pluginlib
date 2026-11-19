import { resolveCatalogLatency } from './latency-resolution.mjs';
import { COMPARISON_CRITERIA, CRITERIA } from './treatment-taxonomy.mjs';
import { isPriceStale, formatPrice } from './catalog.mjs';

export const SORT_RATE = 48;
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const dateFormat = new Intl.DateTimeFormat('fr-FR');
const known = (fact, unit) => fact?.state === 'present' && fact.value?.unit === unit &&
  !Object.entries(fact.conditions || {}).some(([key, value]) => key !== 'conditional' || value !== false);
const measurements = (plugin, key, type) =>
  plugin.classification?.treatments.find(item => item.type === type && item.state === 'present')?.measurements?.[key]
    ?? plugin.classification?.measurements?.[key] ?? [];
const cachedLatency = new WeakMap();
const latencyValues = new WeakMap();
export function currentLatency(plugin, rate) {
  if (!latencyValues.has(plugin)) latencyValues.set(plugin, resolveCatalogLatency(plugin));
  return latencyValues.get(plugin)[rate];
}

export function documentedLatency(plugin) {
  if (!cachedLatency.has(plugin)) {
    const cell = currentLatency(plugin, SORT_RATE);
    const valid = cell?.source && Number.isInteger(cell.samples) && cell.samples >= 0 &&
      !cell.conflict && !cell.uncertain && !cell.variants?.length && !cell.zeroMode &&
      (!cell.unit || cell.unit === 'samples') && !Object.keys(cell.conditions || {}).length &&
      !['pending', 'unverified', 'estimated'].includes(cell.confidence);
    cachedLatency.set(plugin, valid ? { key: cell.samples, text: `${cell.samples} éch. · ${SORT_RATE} kHz`,
      title: cell.source, url: cell.source } : null);
  }
  return cachedLatency.get(plugin);
}

function priceValue(plugin, now) {
  if (plugin.catalogStatus === 'free' && plugin.statusEvidence?.url) {
    return { key: 0, text: formatPrice(0, 'EUR'), title: plugin.statusEvidence.url, url: plugin.statusEvidence.url };
  }
  const price = plugin.pricing;
  if (plugin.catalogStatus === 'free' || !price?.url || price.currency !== 'EUR' || !Number.isFinite(price.normal) || price.normal <= 0 ||
      price.isRange || price.subscription || ['subscription', 'monthly', 'annual'].includes(price.licenseType) || isPriceStale(price, now)) return null;
  const date = dateFormat.format(new Date(price.checkedAt));
  return { key: price.normal, text: `${formatPrice(price.normal, 'EUR')} · ${date}`,
    title: `${price.sourceName || 'Source du tarif'} · ${price.url}`, url: price.url };
}

export function sortValue(plugin, key, type, now) {
  if (key === 'name') return { key: plugin.name, text: '' };
  if (key === 'latency') return documentedLatency(plugin);
  if (key === 'price') return priceValue(plugin, now);
  if (key !== 'attack' && key !== 'release') return null;
  const ranges = measurements(plugin, key, type).filter(fact => known(fact, 'ms') &&
    Number.isFinite(fact.value.min) && Number.isFinite(fact.value.max) && fact.value.min >= 0);
  if (ranges.length !== 1) return null;
  const [fact] = ranges;
  return { key: fact.value.min, text: `${fact.value.min} ms`, title: fact.evidence?.find(proof => proof.url)?.url };
}

export function sortOptions(type, plugins, now) {
  const criteria = COMPARISON_CRITERIA[type] || [];
  const specs = [
    ['name', 'Nom', true],
    ...['attack', 'release'].filter(key => criteria.includes(key))
      .map(key => [key, key === 'release' ? 'Release minimal' : `${CRITERIA[key].label} minimale`, plugins.some(plugin => sortValue(plugin, key, type, now))]),
    ...(!type || criteria.includes('latency48') ? [['latency', `Latence à ${SORT_RATE} kHz`, plugins.some(plugin => documentedLatency(plugin))]] : []),
    ...(criteria.includes('cpu') || !type ? [['cpu', 'CPU · mesures non comparables', false]] : []),
    ['price', 'Prix catalogue en €', plugins.some(plugin => priceValue(plugin, now))]
  ];
  return specs;
}

export function rankResults(plugins, key, direction, type, now) {
  return plugins.map(plugin => ({ plugin, value: sortValue(plugin, key, type, now) })).sort((a, b) => {
    if (!a.value || !b.value) {
      if (a.value !== b.value) return a.value ? -1 : 1;
    } else {
      const order = typeof a.value.key === 'number' ? a.value.key - b.value.key : collator.compare(a.value.key, b.value.key);
      if (order) return order * direction;
    }
    return collator.compare(a.plugin.name, b.plugin.name) || collator.compare(a.plugin.id, b.plugin.id);
  });
}
