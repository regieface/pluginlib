import { resolveCatalogLatency, wavesLatencySource } from './latency-resolution.mjs';
import { ARCHITECTURES, CRITERIA, FORMATS, PROCESSES, TREATMENTS } from './treatment-taxonomy.mjs';

export const CLASSIFICATION_VERSION = 1;
export const FACT_STATES = ['present', 'absent', 'unknown', 'not-applicable', 'pending', 'estimated'];
export const CONFIDENCE_LEVELS = ['verified', 'reported', 'unverified', 'estimated'];
export const UNKNOWN_FACT = Object.freeze({ state: 'unknown' });

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const isId = value => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
const isArrayOf = (values, predicate) => Array.isArray(values) && values.every(predicate);
const sourced = evidence => isRecord(evidence) && isText(evidence.url);
const hasValue = fact => ['present', 'pending', 'estimated'].includes(fact.state);

function isFact(fact) {
  if (!isRecord(fact) || !FACT_STATES.includes(fact.state)) return false;
  if (fact.evidence !== undefined && !isArrayOf(fact.evidence, isRecord)) return false;
  const documented = fact.state === 'present' || fact.state === 'absent';
  if (documented && (!['verified', 'reported'].includes(fact.confidence) || !fact.evidence?.some(sourced))) return false;
  if (fact.confidence !== undefined && !CONFIDENCE_LEVELS.includes(fact.confidence)) return false;
  if (fact.state === 'estimated' && fact.confidence !== 'estimated') return false;
  if (fact.state === 'pending' && ![undefined, 'reported', 'unverified'].includes(fact.confidence)) return false;
  return (fact.conditions === undefined || isRecord(fact.conditions)) &&
    (hasValue(fact) || !Object.hasOwn(fact, 'value'));
}

function validateAssertions(assertions, path, acceptsId) {
  if (assertions === undefined) return;
  requireValid(isArrayOf(assertions, assertion =>
    isFact(assertion) && isId(assertion.id) && acceptsId(assertion.id) && !Object.hasOwn(assertion, 'value')), path);
  requireValid(new Set(assertions.map(assertion => assertion.id)).size === assertions.length, path);
}

function isMeasurement(fact, criterion) {
  if (!isFact(fact)) return false;
  const rate = fact.conditions?.sampleRateKHz;
  if (rate !== undefined && (!Number.isFinite(rate) || rate <= 0 ||
    (criterion.sampleRateKHz !== undefined && rate !== criterion.sampleRateKHz))) return false;
  if (!Object.hasOwn(fact, 'value')) return !['present', 'estimated'].includes(fact.state);

  const { value } = fact;
  if (!isRecord(value) || !criterion.units.includes(value.unit)) return false;
  const hasRange = Object.hasOwn(value, 'min') || Object.hasOwn(value, 'max');
  return hasRange ?
    !Object.hasOwn(value, 'value') && Number.isFinite(value.min) && Number.isFinite(value.max) && value.min <= value.max :
    Number.isFinite(value.value);
}

function validateCriteria(owner, path) {
  for (const section of ['features', 'measurements']) {
    if (owner[section] === undefined) continue;
    requireValid(isRecord(owner[section]), `${path}.${section}`);
    for (const [key, fact] of Object.entries(owner[section])) {
      const criterion = Object.hasOwn(CRITERIA, key) && CRITERIA[key];
      const field = `${path}.${section}.${key}`;
      requireValid(criterion?.section === section, field);
      if (section === 'measurements') {
        requireValid(isArrayOf(fact, item => isMeasurement(item, criterion)) && fact.length > 0, field);
      } else {
        requireValid(isFact(fact), field);
        const valued = Object.hasOwn(fact, 'value');
        const validDetail = isText(fact.value) || (isArrayOf(fact.value, isText) && fact.value.length > 0);
        requireValid(criterion.kind === 'flag' ? !valued :
          valued ? validDetail : !['present', 'estimated'].includes(fact.state), field);
      }
    }
  }
}

function requireValid(condition, path) {
  if (!condition) throw new TypeError(`Classification invalide : ${path}`);
}

export function validateClassification(classification) {
  requireValid(isRecord(classification) && classification.version === CLASSIFICATION_VERSION, 'version');
  const { treatments, formats } = classification;
  requireValid(isArrayOf(treatments, treatment => isFact(treatment) && isId(treatment.type) && Object.hasOwn(TREATMENTS, treatment.type) &&
    !Object.hasOwn(treatment, 'value')), 'treatments');
  requireValid(new Set(treatments.map(treatment => treatment.type)).size === treatments.length, 'treatments (types distincts)');
  validateAssertions(formats, 'formats', id => Object.hasOwn(FORMATS, id));
  validateCriteria(classification, 'classification');
  for (const treatment of treatments) {
    const { type } = treatment;
    const families = TREATMENTS[type].families || {};
    validateAssertions(treatment.families, `${type}.families`, id => Object.hasOwn(families, id));
    validateAssertions(treatment.technologies, `${type}.technologies`,
      id => !Object.hasOwn(ARCHITECTURES, id) && !Object.hasOwn(PROCESSES, id));
    validateAssertions(treatment.architectures, `${type}.architectures`, id => Object.hasOwn(ARCHITECTURES, id));
    validateAssertions(treatment.processes, `${type}.processes`, id => Object.hasOwn(PROCESSES, id));
    validateCriteria(treatment, type);
  }
  return classification;
}

const legacyTypes = {
  comp: 'compressor', gate: 'gate-expander', deesser: 'de-esser', transient: 'transient-shaper',
  eq: 'equalizer', saturation: 'saturation-distortion', reverb: 'reverb', delay: 'delay',
  modulation: 'modulation', stereo: 'stereo-image', pitch: 'pitch-time',
  restoration: 'cleanup-restoration', analysis: 'audio-utility', tuner: 'audio-utility', utility: 'audio-utility'
};

const reviewed = proof => sourced(proof) && proof.method === 'reviewed-source';

function legacyFact(field, proof, state = 'present') {
  const verified = state !== 'pending' && (reviewed(proof) || (sourced(proof) && proof.method === 'latency-table'));
  const confidence = verified ? 'verified' : sourced(proof) ? 'reported' : 'unverified';
  return {
    state: confidence === 'unverified' ? 'pending' : state,
    confidence,
    origin: { kind: 'legacy', field },
    ...(isRecord(proof?.conditions) ? { conditions: proof.conditions } : {}),
    ...(proof ? { evidence: [proof] } : {})
  };
}

function categoryProof(plugin) {
  const proof = plugin.categoryEvidence;
  return proof && proof.category === plugin.category && proof.status === 'documented' ? proof : undefined;
}

// The old limiter bucket also contains clippers. Use only an explicit,
// unambiguous noun in the evidence, and never split a compound treatment.
function legacyType(plugin, proof) {
  if (plugin.recordType && !['effect', 'unknown'].includes(plugin.recordType)) return undefined;
  if (plugin.categoryEvidence?.status === 'unconfirmed') return undefined;
  const { category } = plugin;
  if (Object.hasOwn(legacyTypes, category)) return legacyTypes[category];
  const title = proof?.method === 'product-title' ? proof.excerpt : '';
  if (category === 'limiter' && isText(title) && !/\b(?:no|not|without|unlike|compressor|compressor-limiter)\b/i.test(title)) {
    const clipper = /\bclipper\b/i.test(title);
    const limiter = /\b(?:limiter|maximi[sz]er)\b/i.test(title);
    if (clipper !== limiter) return clipper ? 'clipper' : 'limiter';
  }
  if (category === 'multiband' && isText(title)) {
    // A single explicit product title can establish both the treatment and its architecture.
    const match = /\bmulti[- ]?band\s+(compressor|limiter|expander)\s*$/i.exec(title);
    if (match && !/\b(?:limiter|compressor|expander|gate|no|not|without)\b/i.test(title.slice(0, match.index))) {
      return { compressor: 'compressor', limiter: 'limiter', expander: 'gate-expander' }[match[1].toLowerCase()];
    }
  }
  if (category === 'channel' && proof && /\bchannel[ -]*strip\b/i.test(proof.excerpt || '') &&
    (proof.method === 'product-title' || (plugin.recordType === 'effect' &&
      !/\b(?:collection|extension|host|hôte|not|without|unlike)\b/i.test(proof.excerpt)))) return 'channel-strip';
}

const compressorFamilies = {
  fet: 'fet', vca: 'vca', opto: 'opto', varimu: 'vari-mu', diode: 'diode-bridge', pwm: 'pwm'
};
const eqFamilies = { dynamique: 'dynamic', graphique: 'graphic' };
const reverbFamilies = { plate: 'plate', hall: 'hall', room: 'room', chambre: 'chamber', spring: 'spring' };

function legacyTag(plugin, tag) {
  const proof = plugin.featureEvidence?.[tag];
  const active = plugin.tags?.includes(tag);
  const pending = plugin.unverifiedTags?.includes(tag);
  if (typeof proof?.present === 'boolean' && reviewed(proof)) {
    return legacyFact(`featureEvidence.${tag}`, proof, proof.present ? 'present' : 'absent');
  }
  if (active || pending || typeof proof?.present === 'boolean') {
    const field = proof ? `featureEvidence.${tag}` : active ? `tags.${tag}` : `unverifiedTags.${tag}`;
    return legacyFact(field, proof, 'pending');
  }
}

function legacyAssertions(plugin, prefix, mapping) {
  return Object.entries(mapping).flatMap(([key, id]) => {
    const fact = legacyTag(plugin, `${prefix}:${key}`);
    return fact ? [{ id, ...fact }] : [];
  });
}

function legacyFamilies(plugin, type) {
  const mapping = {
    compressor: ['techno', compressorFamilies],
    equalizer: ['eqtype', eqFamilies],
    reverb: ['espace', reverbFamilies],
    delay: ['espace', { bande: 'tape' }],
    'saturation-distortion': ['saturation', { bande: 'tape', lampe: 'tube', transfo: 'transformer' }]
  }[type];
  return mapping ? legacyAssertions(plugin, ...mapping) : [];
}

function legacyMeasurements(plugin) {
  const latency = resolveCatalogLatency(plugin);
  const measurements = {};
  for (const rate of [48, 96]) {
    const cell = latency[rate];
    if (!cell) continue;
    const facts = [];
    const add = (reading, value, unit, conditions) => {
      const url = reading.source || cell.source;
      if (!url || !Number.isFinite(value)) return;
      const confidence = reading.confidence || cell.confidence;
      const method = confidence === 'verified' ? 'reviewed-source' :
        url === wavesLatencySource ? 'latency-table' : 'legacy-latency-source';
      const proof = { url, method, ...(reading.excerpt || cell.excerpt || cell.note ? { excerpt: reading.excerpt || cell.excerpt || cell.note } : {}),
        ...(reading.checkedAt || cell.checkedAt ? { checkedAt: reading.checkedAt || cell.checkedAt } : {}) };
      const pending = ['unverified', 'pending', 'estimated'].includes(confidence);
      facts.push({
        ...legacyFact(`latency.${rate}`, proof, pending ? 'pending' : 'present'),
        value: { value, unit }, conditions: { ...conditions, sampleRateKHz: rate }
      });
    };
    for (const mode of cell.variants || []) {
      add(mode, mode.samples, 'samples', { ...mode.conditions, conditional: true, mode: mode.label });
    }
    if (!cell.conflict && !cell.uncertain && !facts.length) {
      add(cell, cell.samples, cell.unit || 'samples', { ...cell.conditions, ...(cell.zeroMode ? { conditional: true } : {}) });
    }
    if (facts.length) measurements[`latency${rate}`] = facts;
  }
  return measurements;
}

export function normalizeClassification(plugin) {
  if (Object.hasOwn(plugin, 'classification')) {
    validateClassification(plugin.classification);
    return plugin;
  }

  const proof = categoryProof(plugin);
  const description = typeof plugin.description === 'string' ? plugin.description : '';
  const clipperStatement = plugin.category === 'limiter' && plugin.recordType === 'effect' && proof && sourced(plugin) &&
    /clip/i.test(plugin.name || '') && !/\b(?:limiter|maximi[sz]er|compressor)\b/i.test(plugin.name || '') &&
    /\bour (?:[\w-]+ )?clipper (?:is|has|offers|provides)\b/i.test(description)
    ? { url: plugin.url, method: 'product-description', excerpt: description, checkedAt: plugin.checkedAt }
    : undefined;
  const type = clipperStatement ? 'clipper' : legacyType(plugin, proof);
  const treatments = [];
  const formats = [];
  const features = Object.fromEntries([
    ['externalSidechain', legacyTag(plugin, 'opt:sidechain')],
    ['midSide', legacyTag(plugin, 'opt:ms')]
  ].filter(([, fact]) => fact));

  if (type) {
    const families = legacyFamilies(plugin, type);
    const classificationFact = clipperStatement ? legacyFact('description', clipperStatement) :
      legacyFact(proof ? 'categoryEvidence' : 'category', proof);
    const treatment = { type, ...classificationFact, families };
    if (plugin.category === 'multiband') treatment.architectures = [{ id: 'multiband', ...classificationFact }];
    if (type === 'compressor') {
      treatment.technologies = families.map(fact => ({ ...fact }));
    }
    if (type === 'reverb') {
      treatment.technologies = legacyAssertions(plugin, 'espace', {
        convolution: 'convolution', algorithmique: 'algorithmic'
      });
    }
    if (type === 'equalizer') {
      const dynamic = legacyTag(plugin, 'eqtype:dynamique');
      if (dynamic) treatment.features = { dynamicProcessing: dynamic };
    }
    treatments.push(treatment);
  }

  // A legacy "multi" label alone can also denote a host or a bundle.
  if (plugin.category === 'multi' && plugin.recordType === 'effect' &&
    proof?.method === 'product-description' &&
    /\bis\b[^.!?]*\bmulti[- ](?:effects?|fx)\b/i.test(proof.excerpt || '') &&
    !/\b(?:no|not|without|unlike|bundle|collection|comprised of)\b/i.test(proof.excerpt)) {
    formats.push({ id: 'multi-effects', ...legacyFact('categoryEvidence', proof) });
  }

  return {
    ...plugin,
    classification: validateClassification({
      version: CLASSIFICATION_VERSION, treatments, formats, features, measurements: legacyMeasurements(plugin)
    })
  };
}
