import { CATALOG_STATUSES, PLATFORMS } from './catalog.mjs';

const unknown = () => entry('Non renseigné', 'unknown');
const entry = (value, quality, proof) => ({ value, quality, source: proof?.url, context: proof?.excerpt });
const confidence = proof => proof?.url && (proof.method === 'latency-table' || proof.method?.startsWith('reviewed'))
  ? 'verified' : 'pending';

function feature(plugin, tag, label) {
  const proof = plugin.featureEvidence?.[tag];
  if (proof?.present === false && confidence(proof) === 'verified') {
    return entry(label ? `${label} · Absence documentée` : 'Absence documentée', 'verified', proof);
  }
  if (plugin.tags?.includes(tag) || proof?.present === true) {
    return entry(label || 'Présent', confidence(proof), proof);
  }
  if (plugin.unverifiedTags?.includes(tag)) return entry(label || 'Présence à confirmer', 'pending', proof);
}

function availableFact(value, proof, verified = false) {
  return [value ? entry(value, verified ? 'verified' : confidence(proof), proof) : unknown()];
}

const samples = value => `${value} échantillon${value > 1 ? 's' : ''}`;
const modeValues = modes => modes.map(mode => `${mode.label} · ${samples(mode.samples)}`).join(' / ');

function rateLatency(plugin, rate) {
  const latency = plugin.latency?.[rate];
  const info = plugin.latencyInfo;
  if (latency?.variants?.length) {
    return [entry(modeValues(latency.variants), 'conditional', { url: plugin.latency.source || info?.url, excerpt: latency.note })];
  }
  if (Number.isFinite(latency?.samples)) {
    const conditional = latency.zeroMode || (!plugin.latency.source && info?.conditional);
    const proof = plugin.latency.source ? { url: plugin.latency.source } : info;
    return [entry(samples(latency.samples), conditional ? 'conditional' : proof?.url ? 'verified' : 'pending', proof)];
  }
  if (info?.sampleRate === rate) return latencyNote(plugin);
  return latency?.note ? [entry(latency.note, 'pending', { url: plugin.latency.source || info?.url })] : [unknown()];
}

function latencyNote(plugin) {
  const info = plugin.latencyInfo;
  if (!info) return plugin.unverifiedLatencyInfo ? [entry('Latence à confirmer', 'pending')] : [unknown()];
  const modes = info.modes?.length ? modeValues(info.modes) : '';
  const values = info.values?.map(({ value, unit }) => unit === 'samples' ? samples(value) : `${value} ${unit}`).join(' / ');
  const summary = info.noteFr || values || (info.zero ? 'Latence nulle annoncée' : info.excerpt);
  const rate = info.sampleRate ? `${info.sampleRate.toLocaleString('fr-FR')} kHz` : 'Fréquence non précisée';
  return [entry([rate, summary, modes].filter(Boolean).join(' · '), info.conditional || modes ? 'conditional' : info.url ? 'verified' : 'pending', info)];
}

export function buildComparison(plugins, labels, licenseStatus, statusLabels) {
  const row = (label, get) => ({ label, cells: plugins.map(get) });
  const sameFamily = plugins.every(plugin => plugin.category === plugins[0]?.category);
  const facets = Object.entries(labels.facets).flatMap(([key, facet]) => {
    if (!plugins.every(plugin => facet.for.includes(plugin.category))) return [];
    const result = row(facet.label, plugin => {
      const values = Object.entries(facet.values)
        .map(([id, label]) => feature(plugin, `${key}:${id}`, label))
        .filter(Boolean);
      return values.length ? values : [unknown()];
    });
    return sameFamily || result.cells.some(cell => cell[0].quality !== 'unknown') ? [result] : [];
  });

  const latencyRows = [48, 96].map(rate => row(`Latence à ${rate} kHz`, plugin => rateLatency(plugin, rate)));
  if (plugins.some(plugin => plugin.latencyInfo || plugin.unverifiedLatencyInfo)) {
    latencyRows.push(row('Précisions publiées', latencyNote));
  }
  return [
    { title: 'Traitement', rows: [
      row('Famille', plugin => availableFact(labels.categories[plugin.category], plugin.categoryEvidence)),
      ...facets
    ] },
    { title: 'Fonctions et modes', rows: Object.entries(labels.common).map(([id, label]) =>
      row(label, plugin => [feature(plugin, `opt:${id}`) || unknown()])) },
    { title: 'Latence', rows: latencyRows },
    { title: 'Compatibilité et collection', rows: [
      row('Plateformes', plugin => availableFact(plugin.platforms?.map(id => PLATFORMS[id]).filter(Boolean).sort().join(' · '), plugin.platformEvidence, !!plugin.platformEvidence?.url)),
      row('Disponibilité', plugin => availableFact(plugin.catalogStatus !== 'unknown' && CATALOG_STATUSES[plugin.catalogStatus], plugin.statusEvidence, !!plugin.statusEvidence?.url)),
      row('Licence', plugin => {
        const status = licenseStatus(plugin);
        return [status !== 'unknown' && statusLabels[status] ? entry(statusLabels[status], 'collection') : unknown()];
      })
    ] }
  ];
}

export function hasComparisonDifference({ cells }) {
  // Une égalité apparente entre données incertaines ne prouve pas l’équivalence.
  if (cells.some(cell => cell.some(({ quality }) => !['verified', 'collection'].includes(quality)))) return true;
  const signature = cell => JSON.stringify(cell.map(({ value, quality }) => JSON.stringify([value, quality])).sort());
  return cells.some(cell => signature(cell) !== signature(cells[0]));
}

export function comparisonScrollState({ scrollLeft, scrollWidth, clientWidth }) {
  const range = scrollWidth - clientWidth;
  // Le scrollLeft peut être fractionnaire et dépasser les bornes sur Safari.
  if (clientWidth <= 0 || range <= 1) return { left: false, right: false };
  return { left: scrollLeft > 1, right: scrollLeft < range - 1 };
}
