// La compatibilité historique est calculée avant cette projection.
import { applyCatalogOverride } from '../catalog.mjs';
import { CLASSIFICATION_VERSION, normalizeClassification, validateClassification } from '../classification.mjs';
import { ARCHITECTURES, FORMATS, PROCESSES, TREATMENTS } from '../treatment-taxonomy.mjs';

export function applyProducerOverride(plugin, override) {
  if (!override) return plugin;
  const { classification, featureEvidence, ...legacy } = override;
  if (featureEvidence) {
    legacy.featureEvidence = { ...plugin.featureEvidence };
    for (const [tag, proof] of Object.entries(featureEvidence)) {
      const old = legacy.featureEvidence[tag];
      const reviewed = evidence => evidence?.method === 'reviewed-source' && evidence.url && typeof evidence.present === 'boolean';
      if (!reviewed(old) || reviewed(proof)) legacy.featureEvidence[tag] = proof;
    }
  }
  // L'identité de rapprochement et les alias déjà publiés restent attachés à la fiche.
  delete legacy.id;
  if (legacy.legacyIds) legacy.legacyIds = [...new Set([...(plugin.legacyIds || []), ...legacy.legacyIds])];
  return applyCatalogOverride(plugin, legacy);
}

const assertionLists = ['families', 'technologies', 'architectures', 'processes', 'formats'];
const comparisonKey = fact => JSON.stringify([
  fact.value?.unit, Object.entries(fact.conditions || {}).sort(([a], [b]) => a.localeCompare(b))
]);

function mergeOwner(current, correction) {
  const merged = { ...current, ...correction };
  for (const key of assertionLists) {
    if (!correction[key]) continue;
    const byId = new Map((current[key] || []).map(fact => [fact.id, fact]));
    for (const fact of correction[key]) byId.set(fact.id, fact);
    merged[key] = [...byId.values()];
  }
  if (correction.features) merged.features = { ...current.features, ...correction.features };
  if (correction.measurements) {
    merged.measurements = { ...current.measurements };
    for (const [key, facts] of Object.entries(correction.measurements)) {
      const corrected = new Set(facts.map(comparisonKey));
      merged.measurements[key] = [
        ...(current.measurements?.[key] || []).filter(fact => !corrected.has(comparisonKey(fact))), ...facts
      ];
    }
  }
  return merged;
}

function explicitCorrection(classification) {
  validateClassification(classification);
  for (const owner of [classification, ...classification.treatments]) {
    const assertions = [
      ...(owner.type ? [owner] : []),
      ...assertionLists.flatMap(key => owner[key] || []),
      ...Object.values(owner.features || {}), ...Object.values(owner.measurements || {}).flat()
    ];
    if (assertions.some(fact => fact.confidence !== 'verified' ||
      !fact.evidence?.some(proof => typeof proof.url === 'string' && proof.url.trim()))) {
      throw new TypeError('Une correction de classification doit être vérifiée et sourcée.');
    }
  }
}

export function materializeClassification(plugin, override) {
  try {
    const { classification } = normalizeClassification(plugin);
    if (!override || !Object.hasOwn(override, 'classification')) return classification;
    const correction = override.classification;
    explicitCorrection(correction);
    const treatments = new Map(classification.treatments.map(treatment => [treatment.type, treatment]));
    for (const treatment of correction.treatments) {
      treatments.set(treatment.type, mergeOwner(treatments.get(treatment.type) || {}, treatment));
    }
    return validateClassification({ ...mergeOwner(classification, correction), treatments: [...treatments.values()] });
  } catch (error) {
    throw new Error(`Classification de ${plugin.id} : ${error.message}`, { cause: error });
  }
}

export function classificationMetadata() {
  return { version: CLASSIFICATION_VERSION, treatments: TREATMENTS, formats: FORMATS, architectures: ARCHITECTURES, processes: PROCESSES };
}

export function classificationReviewReason(plugin) {
  const { classification, ...legacy } = plugin;
  if (!classification || plugin.exclude || plugin.duplicateOf ||
    !['effect', 'unknown', undefined].includes(plugin.recordType)) return undefined;
  const present = classification.treatments.filter(fact => fact.state === 'present');
  if (!present.length) return 'treatment-unconfirmed';
  const proposed = normalizeClassification(legacy).classification.treatments;
  if (proposed.some(fact => !present.some(treatment => treatment.type === fact.type))) return 'legacy-treatment-conflict';
}
