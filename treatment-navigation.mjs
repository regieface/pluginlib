import { ARCHITECTURES, COMPARISON_CRITERIA, CRITERIA, FORMATS, PROCESSES, TREATMENTS } from './treatment-taxonomy.mjs';

export const TREATMENT_OPTIONS = Object.entries(TREATMENTS).map(([id, type]) => [id, type.label]);
export const CLASSIFICATION_OPTIONS = [['unclassified', 'À classer'], ['classified', 'Classés']];
export const FACT_LABELS = {
  verified: 'Vérifié', reported: 'Rapporté', present: 'Documenté',
  absent: 'Absence documentée', unknown: 'Non renseigné', 'not-applicable': 'Sans objet',
  pending: 'À confirmer', estimated: 'Estimé'
};
const factOptions = [
  ['present', 'Présence documentée'], ['absent', FACT_LABELS.absent], ['not-applicable', FACT_LABELS['not-applicable']]
];
const filterableStates = new Set(factOptions.map(([state]) => state));
const treatmentsFor = criterion => Object.keys(TREATMENTS).filter(type => COMPARISON_CRITERIA[type].includes(criterion));

export function classifiedTreatments(plugin) {
  return (plugin.classification?.treatments || []).filter(fact => fact.state === 'present');
}

export function selectedTreatmentIds(selection, contextual = false) {
  if (contextual && !selection?.include.length) return [];
  return Object.keys(TREATMENTS).filter(id =>
    !selection?.exclude.includes(id) && (!selection?.include.length || selection.include.includes(id)));
}

const familyOptions = Object.entries(TREATMENTS).flatMap(([id, type]) =>
  Object.entries(type.families || {}).map(([family, label]) => [`${id}/${family}`, `${label} · ${type.label}`]));

export function technologyLabel(id, type) {
  const families = TREATMENTS[type]?.families;
  return families?.[id] || ({ algorithmic: 'Algorithmique', convolution: 'Convolution' })[id] || id;
}

export function navigationFacets(plugins) {
  const technologies = new Map();
  for (const plugin of plugins) for (const treatment of classifiedTreatments(plugin)) {
    for (const fact of treatment.technologies || []) {
      if (fact.state === 'present') technologies.set(fact.id, technologyLabel(fact.id, treatment.type));
    }
  }
  return {
    treatmentFamily: { label: 'Familles', options: familyOptions, for: treatmentsFor('family') },
    technology: { label: CRITERIA.technology.label, options: [...technologies].sort((a, b) => a[1].localeCompare(b[1], 'fr')),
      for: Object.keys(TREATMENTS) },
    architecture: { label: 'Architecture', options: Object.entries(ARCHITECTURES), for: Object.keys(TREATMENTS) },
    process: { label: 'Procédé', options: Object.entries(PROCESSES), for: Object.keys(TREATMENTS) },
    ...Object.fromEntries(Object.entries(CRITERIA).filter(([, criterion]) => ['features', 'measurements'].includes(criterion.section))
      .map(([key, criterion]) => [key, { label: criterion.label, options: factOptions, for: treatmentsFor(key) }]))
  };
}

export function isTreatmentFacet(key) {
  return ['treatmentFamily', 'technology', 'architecture', 'process'].includes(key) ||
    ['features', 'measurements'].includes(CRITERIA[key]?.section);
}

export function treatmentFacetValues(plugin, key, selection) {
  const selected = selectedTreatmentIds(selection);
  const scoped = classifiedTreatments(plugin).filter(treatment => selected.includes(treatment.type));
  const field = { treatmentFamily: 'families', technology: 'technologies', architecture: 'architectures', process: 'processes' }[key];
  if (field) return scoped.flatMap(treatment => (treatment[field] || [])
    .filter(fact => fact.state === 'present').map(fact => key === 'treatmentFamily' ? `${treatment.type}/${fact.id}` : fact.id));

  const section = CRITERIA[key].section;
  const relevant = scoped.filter(treatment => COMPARISON_CRITERIA[treatment.type].includes(key) || treatment[section]?.[key]);
  return relevant.flatMap(treatment => {
    const local = treatment[section]?.[key];
    const facts = local ?? plugin.classification?.[section]?.[key];
    return [facts].flat().filter(fact => filterableStates.has(fact?.state)).map(fact => fact.state);
  });
}

export function classificationSearchText(plugin) {
  const treatments = classifiedTreatments(plugin);
  return [
    ...(treatments.length ? treatments.map(({ type }) => TREATMENTS[type].label) : ['À classer']),
    ...treatments.flatMap(treatment => (treatment.families || []).filter(fact => fact.state === 'present')
      .map(fact => TREATMENTS[treatment.type].families?.[fact.id])),
    ...(plugin.classification?.formats || []).filter(fact => fact.state === 'present').map(fact => FORMATS[fact.id])
  ].filter(Boolean).join(' ');
}

export function factStateLabel(fact) {
  if (fact.state === 'present') return FACT_LABELS[fact.confidence] || FACT_LABELS.present;
  return FACT_LABELS[fact.state];
}

export function factValueLabel(fact) {
  const value = fact.value;
  if (Array.isArray(value)) return value.join(' · ');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    return Number.isFinite(value.value) ? `${value.value} ${value.unit}` : `${value.min}–${value.max} ${value.unit}`;
  }
  return '';
}

export function treatmentDetails(plugin, treatment) {
  const { type } = treatment;
  const list = (label, facts, names) => (facts || []).map(fact => ({ label, value: names(fact.id), fact }));
  const rows = [
    ...list('Famille', treatment.families, id => TREATMENTS[type].families?.[id] || id),
    ...list(CRITERIA.technology.label, treatment.technologies, id => technologyLabel(id, type)),
    ...list('Architecture', treatment.architectures, id => ARCHITECTURES[id] || id),
    ...list('Procédé', treatment.processes, id => PROCESSES[id] || id)
  ];
  const keys = new Set([...COMPARISON_CRITERIA[type],
    ...Object.keys(treatment.features || {}), ...Object.keys(treatment.measurements || {})]);
  for (const key of keys) {
    const definition = CRITERIA[key];
    if (definition.section !== 'features' && definition.section !== 'measurements') continue;
    const own = treatment[definition.section]?.[key];
    const facts = own ?? plugin.classification?.[definition.section]?.[key] ?? { state: 'unknown' };
    for (const fact of [facts].flat()) rows.push({ label: definition.label, value: factValueLabel(fact), fact });
  }
  return rows;
}


export function sharedClassificationDetails(plugin) {
  const treatments = plugin.classification?.treatments || [];
  return ['features', 'measurements'].flatMap(section =>
    Object.entries(plugin.classification?.[section] || {}).flatMap(([key, facts]) => {
      if (treatments.some(treatment => COMPARISON_CRITERIA[treatment.type].includes(key) && !treatment[section]?.[key])) return [];
      return [facts].flat().map(fact => ({ label: CRITERIA[key].label, value: factValueLabel(fact), fact }));
    }));
}


export function needsCatalogueReview(plugin) {
  if (plugin.unverifiedTags?.length || plugin.unverifiedLatencyInfo ||
    Object.values(plugin.latency || {}).some(cell => cell?.conflict || cell?.uncertain)) return true;
  const pending = facts => [facts].flat().some(fact => fact?.state === 'pending');
  const classification = plugin.classification || {};
  return [classification, ...(classification.treatments || [])].some(item =>
    pending(item) || ['families', 'technologies', 'architectures', 'processes', 'formats'].some(key => pending(item[key])) ||
    ['features', 'measurements'].some(section => Object.values(item[section] || {}).some(pending)));
}
