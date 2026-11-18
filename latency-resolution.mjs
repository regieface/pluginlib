const latencyRate = /^\d+(?:\.\d+)?$/;
export const wavesLatencySource = 'https://www.waves.com/support/tech-specs/plugin-latency';
export const conflictNote = 'Latence à confirmer : relevés contradictoires.';
const knownModes = cell => (cell.variants || []).filter(mode => typeof mode.label === 'string' && mode.label.trim() && Number.isFinite(mode.samples));
const knownLatency = cell => Number.isFinite(cell.samples) || knownModes(cell).length > 0;
const latencyConfidence = cell => ['pending', 'unverified', 'estimated'].includes(cell.confidence) ? 0 :
  cell.source && (cell.confidence === 'verified' || cell.source === wavesLatencySource) ? 2 : cell.source ? 1 : 0;
const latencyKey = value => JSON.stringify(value, (_, fields) =>
  fields && typeof fields === 'object' && !Array.isArray(fields)
    ? Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))) : fields);

function latencyHistory(result, previous, incoming, ...displaced) {
  const entries = [...(previous.history || []), ...(incoming.history || []),
    ...displaced.map(({ history, ...cell }) => cell)];
  if (entries.length) result.history = [...new Map(entries.map(cell => [latencyKey(cell), cell]))]
    .sort(([a], [b]) => a.localeCompare(b)).map(([, cell]) => cell);
  return result;
}

const latencyModeKey = mode => latencyKey([mode.label.trim().toLowerCase(),
  Object.keys(mode.conditions || {}).length ? mode.conditions : undefined, mode.unit || 'samples']);
const comparisonScope = cell => latencyKey([cell.conditions, cell.unit || 'samples']);
const rank = (left, right) => {
  const confidence = latencyConfidence(left) - latencyConfidence(right);
  if (confidence || !left.source || left.source !== right.source) return confidence;
  const first = Date.parse(left.checkedAt), second = Date.parse(right.checkedAt);
  return Number.isFinite(first) && Number.isFinite(second) ? Math.sign(first - second) : 0;
};
// Replay the observations by scope. A cell's conflict flag is a projection,
// not a claim that a later reading can settle for the entire frequency.
function observations(cell) {
  if (!cell) return [];
  const { variants, history, source, confidence, checkedAt, excerpt, conditions, ...rest } = cell;
  const provenance = { source, confidence, checkedAt, excerpt };
  const named = knownModes(cell);
  const { modes: coveredModes, mode: coveredMode, ...otherConditions } = conditions || {};
  const labels = Array.isArray(coveredModes) ? coveredModes : [coveredMode];
  const explicitCoverage = labels.filter(label => typeof label === 'string' && label.trim());
  const modes = named.length ? named : Number.isFinite(rest.samples) && explicitCoverage.length && (!rest.unit || rest.unit === 'samples')
    ? explicitCoverage.map(label => ({ label, samples: rest.samples })) : [];
  const scoped = modes.map(mode => ({
    ...Object.fromEntries(Object.entries(provenance).filter(([, value]) => value !== undefined)),
    ...(Object.keys(otherConditions).length ? { conditions: otherConditions } : {}),
    ...mode,
    ...(Object.keys(otherConditions).length && mode.conditions ? { conditions: { ...otherConditions, ...mode.conditions } } : {})
  }));
  const global = Number.isFinite(rest.samples) && (!explicitCoverage.length || !modes.length)
    ? [{ ...rest, ...(source ? { source } : {}), ...(conditions ? { conditions } : {}),
      ...Object.fromEntries(Object.entries({ confidence, checkedAt, excerpt }).filter(([, value]) => value !== undefined)) }]
    : [];
  return [...scoped, ...global, ...(history || []).flatMap(observations)];
}

function resolveModeObservations(cells) {
  const readings = [...new Map(cells.flatMap(observations).map(reading => [latencyKey(reading), reading])).values()];
  const scoped = readings.filter(reading => reading.label);
  if (!scoped.length) return undefined;
  const global = readings.filter(reading => !reading.label);
  const byScope = new Map();
  for (const reading of scoped) {
    const key = latencyModeKey(reading);
    byScope.set(key, [...(byScope.get(key) || []), reading]);
  }

  const variants = [], disputed = [], displaced = [];
  for (const [, candidates] of [...byScope].sort(([a], [b]) => a.localeCompare(b))) {
    const best = candidates.filter(candidate => !candidates.some(other => rank(other, candidate) > 0));
    if (new Set(best.map(candidate => candidate.samples)).size > 1) {
      disputed.push(candidates.map(candidate => candidate.label).sort()[0]);
      displaced.push(...candidates);
      continue;
    }
    const winner = [...best].sort((a, b) => latencyKey(a).localeCompare(latencyKey(b)))[0];
    variants.push(winner);
    displaced.push(...candidates.filter(candidate => candidate !== winner));
  }

  // Scope-free and explicitly named measurements are never contenders.
  // An existing global disagreement is evaluated separately by its own scope.
  const globalScopes = new Map();
  for (const reading of global) {
    const key = comparisonScope(reading);
    globalScopes.set(key, [...(globalScopes.get(key) || []), reading]);
  }
  const globalConflict = [...globalScopes.values()].some(candidates => {
    const best = candidates.filter(candidate => !candidates.some(other => rank(other, candidate) > 0));
    return new Set(best.map(candidate => candidate.samples)).size > 1;
  });
  const unresolvedPrior = cells.some(cell => (cell?.conflict || cell?.uncertain) &&
    !(cell.history || []).some(entry => observations(entry).length));
  const conflict = disputed.length > 0 || globalConflict || unresolvedPrior;
  const uncertain = !conflict && global.some(reading => !reading.conditions &&
    variants.some(mode => mode.samples !== reading.samples));
  const sources = new Set(variants.map(mode => mode.source));
  const source = sources.size === 1 ? sources.values().next().value : undefined;
  const outputModes = variants.map(mode => {
    if (!source) return mode;
    const { source: modeSource, ...scopedMode } = mode;
    return scopedMode;
  });
  const notes = [...new Set(cells.flatMap(cell => cell?.notes || [cell?.note])
    .filter(value => value && value !== conflictNote))].sort();
  const note = conflict ? conflictNote : notes.join(' · ');
  const result = {
    ...(conflict || global.length || cells.some(cell => cell && Object.hasOwn(cell, 'samples')) ? { samples: null } : {}),
    ...(outputModes.length ? { variants: outputModes } : {}),
    ...(source ? { source } : {}),
    ...(conflict ? { conflict: true } : {}),
    ...(disputed.length ? { conflictingModes: [...new Set(disputed)] } : {}),
    ...(uncertain ? { uncertain: true } : {}),
    ...(note ? { note } : {}),
    ...(notes.length > 1 || (conflict && notes.length) ? { notes } : {})
  };
  // Keep the old scalar shape, and record scoped alternatives as named variants
  // so they remain associated with the original context on the next merge.
  const archivedModes = displaced.map(({ source: modeSource, ...mode }) => ({
    samples: null, variants: [mode], ...(modeSource ? { source: modeSource } : {})
  }));
  return latencyHistory(result, {}, {}, ...global, ...archivedModes,
    ...cells.flatMap(cell => (cell?.history || []).filter(entry => !observations(entry).length)));
}

function mergeLatencyCell(previous, incoming) {
  if (!previous || !incoming) return incoming || previous;
  const scoped = resolveModeObservations([previous, incoming]);
  if (scoped) return scoped;
  if (previous.conflict || incoming.conflict || previous.uncertain || incoming.uncertain) {
    const previousIssue = previous.conflict || previous.uncertain;
    const incomingIssue = incoming.conflict || incoming.uncertain;
    const bothIssues = previousIssue && incomingIssue;
    const disputed = bothIssues && Boolean(previous.conflict) !== Boolean(incoming.conflict)
      ? (previous.conflict ? previous : incoming)
      : previousIssue && (!incomingIssue || latencyKey(previous) < latencyKey(incoming)) ? previous : incoming;
    const candidate = disputed === previous ? incoming : previous;
    const history = disputed.history || [];
    if (!candidate.conflict && !candidate.uncertain && knownLatency(candidate) && history.length &&
      history.every(old => comparisonScope(candidate) === comparisonScope(old) && rank(candidate, old) > 0)) {
      return latencyHistory({ ...candidate }, previous, incoming);
    }
    return latencyHistory({ ...disputed, samples: null }, previous, incoming,
      ...(candidate.conflict || candidate.uncertain || !knownLatency(candidate) ? [] : [candidate]));
  }
  if (!knownLatency(incoming)) return latencyHistory({ ...incoming, ...previous }, previous, incoming);
  if (!knownLatency(previous)) return latencyHistory({ ...previous, ...incoming }, previous, incoming);

  const sameSource = previous.source === incoming.source;
  if (comparisonScope(previous) !== comparisonScope(incoming)) {
    return latencyHistory({ samples: null, note: 'Latence à confirmer : conditions de mesure différentes.', uncertain: true },
      previous, incoming, previous, incoming);
  }
  const priority = rank(previous, incoming);
  if (!priority && previous.samples !== incoming.samples) {
    return latencyHistory({ samples: null, conflict: true, note: conflictNote }, previous, incoming, previous, incoming);
  }

  const keepOld = priority > 0 || (priority === 0 && latencyKey(previous) < latencyKey(incoming));
  const [preferred, fallback] = keepOld ? [previous, incoming] : [incoming, previous];
  const displaced = !sameSource || fallback.samples !== preferred.samples;
  return latencyHistory({ ...(sameSource ? fallback : {}), ...preferred }, previous, incoming,
    ...(displaced ? [fallback] : []));
}

// Sources différentes : la provenance suit la fréquence, sans attribuer un
// relevé conservé à la source d'un autre relevé.
export function mergeCatalogLatency(previous, incoming) {
  if (!previous && !incoming) return undefined;
  previous ||= {};
  incoming ||= {};
  const merged = { ...previous, ...incoming };
  for (const rate of Object.keys(merged).filter(key => latencyRate.test(key))) {
    const oldCell = previous[rate], cell = incoming[rate];
    const withSource = (value, source) => value && (source && !value.source && (!value.conflict && !value.uncertain || value.variants?.length)
      ? { ...value, source } : value);
    const result = mergeLatencyCell(normalizeTableCell(withSource(oldCell, previous.source)),
      normalizeTableCell(withSource(cell, incoming.source)));
    if (result) merged[rate] = result;
  }
  const cells = Object.keys(merged).filter(key => latencyRate.test(key) && merged[key]);
  const sources = new Set(cells.map(rate => merged[rate].source));
  const source = sources.size === 1 ? sources.values().next().value : undefined;
  if (source) {
    merged.source = source;
    for (const rate of cells) {
      const { source: cellSource, ...cell } = merged[rate];
      merged[rate] = cell;
    }
  } else {
    delete merged.source;
  }
  return merged;
}

export function latencyReports(info) {
  if (!info) return [];
  const { reports = [], ...primary } = info;
  const unique = new Map([primary, ...reports].filter(report => report && !report.resolutionSummary && Object.keys(report).length)
    .map(report => [latencyKey(report), report]));
  return [...unique.values()];
}

export function mergeLatencyInfo(previous, incoming) {
  if (!previous || !incoming) return incoming || previous;
  return presentLatencyInfo({ reports: [...latencyReports(previous), ...latencyReports(incoming)] });
}

// The legacy readers use the primary note as a fallback when no numeric
// cell exists. Only a report consistent with the current solution may
// become that note. A review summary is a projection, never evidence.
export function presentLatencyInfo(info, resolved = resolveReportedLatency(info)) {
  const reports = latencyReports(info).sort((a, b) => latencyKey(a).localeCompare(latencyKey(b)));
  if (!reports.length) return info;
  const hasNumbers = report => report.values?.length || report.modes?.length;
  const eligible = reports.filter(report => {
    if (!hasNumbers(report) || !Number.isFinite(report.sampleRate)) return false;
    const cell = resolved[report.sampleRate];
    if (!cell || cell.conflict || cell.uncertain) return false;
    const current = observations({ ...cell, history: undefined });
    const candidates = reportCandidates(report).flatMap(observations);
    return candidates.length && candidates.every(candidate => current.some(reading =>
      reading.samples === candidate.samples &&
      (reading.label && candidate.label ? latencyModeKey(reading) === latencyModeKey(candidate) :
        !reading.label && !candidate.label && comparisonScope(reading) === comparisonScope(candidate))));
  });
  const issue = Object.values(resolved).some(cell => cell?.conflict || cell?.uncertain);
  const fallback = issue ? [] : reports.filter(report => !hasNumbers(report) || !Number.isFinite(report.sampleRate));
  const [primary] = (eligible.length ? eligible : fallback).sort((a, b) =>
    latencyConfidence(reportSource(b)) - latencyConfidence(reportSource(a)) ||
    (a.sampleRate || Infinity) - (b.sampleRate || Infinity) || latencyKey(a).localeCompare(latencyKey(b)));
  if (!primary) return {
    resolutionSummary: true, zero: false, values: [], conditional: false, sampleRate: null,
    noteFr: issue ? conflictNote : 'Latence à confirmer : les relevés ne précisent pas une mesure courante.',
    reports
  };
  return reports.length === 1 ? primary : { ...primary, reports };
}

function reportSource(report) {
  return {
    ...(report.url ? { source: report.url } : {}),
    ...(report.checkedAt ? { checkedAt: report.checkedAt } : {}),
    ...(report.excerpt ? { excerpt: report.excerpt } : {}),
    ...(report.confidence ? { confidence: report.confidence } :
      report.method === 'reviewed-source' ? { confidence: 'verified' } : {})
  };
}

function reportCandidates(report) {
  const source = reportSource(report);
  const relevant = (report.values || []).filter(value =>
    Number.isFinite(value.value) && ['samples', 'ms'].includes(value.unit));
  const modes = knownModes({ variants: report.modes });
  const conditions = { ...report.conditions };
  if (report.mode) conditions.mode = report.mode;
  if (report.conditional) {
    conditions.conditional = true;
    if (!modes.length && !report.mode && !Object.keys(report.conditions || {}).length && report.excerpt) {
      conditions.context = report.excerpt;
    }
  }
  const evidence = { ...source, ...(Object.keys(conditions).length ? { conditions } : {}) };
  if (modes.length) {
    return modes.map(mode => ({
      ...source, samples: null, variants: [{
        ...mode, ...(Object.keys(report.conditions || {}).length ? { conditions: { ...report.conditions, ...mode.conditions } } : {})
      }]
    }));
  }
  return relevant.flatMap(({ value, unit }) => {
    const cell = { ...evidence, samples: value, ...(unit === 'samples' ? {} : { unit }) };
    const scoped = observations(cell).filter(reading => reading.label);
    if (!scoped.length) return [cell];
    return scoped.map(mode => ({ ...source, samples: null, variants: [mode] }));
  });
}

function resolveReportsAtRate(candidates) {
  const scopes = new Map();
  for (const cell of candidates) {
    const key = cell.variants ? 'mode:' + latencyModeKey(cell.variants[0]) : 'reading:' + comparisonScope(cell);
    scopes.set(key, [...(scopes.get(key) || []), cell]);
  }
  const ordered = values => [...values].sort((a, b) =>
    latencyConfidence(b) - latencyConfidence(a) || latencyKey(a).localeCompare(latencyKey(b)));
  const groups = [...scopes.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, cell: ordered(values).reduce(mergeLatencyCell) }));
  const conflicts = groups.filter(({ cell }) => cell.conflict);
  const globals = groups.filter(({ key, cell }) => key.startsWith('reading:') && !cell.conflict).map(({ cell }) => cell);
  const modes = groups.filter(({ key, cell }) => key.startsWith('mode:') && !cell.conflict).map(({ cell }) => cell);
  let current = modes.length ? resolveModeObservations(modes) : undefined;
  if (globals.length === 1) current = mergeLatencyCell(current, globals[0]);
  // Independent scopes and units remain available in the source reports.
  if (globals.length > 1) {
    current = latencyHistory({ ...(current || {}), samples: null,
      uncertain: true, note: 'Latence à confirmer : plusieurs conditions ou unités.' }, {}, {}, ...globals);
  }
  if (conflicts.length) {
    current = latencyHistory({ ...(current || {}), samples: null, conflict: true, note: conflictNote },
      current || {}, {}, ...conflicts.flatMap(({ cell }) => cell.history || []));
  }
  return normalizeTableCell(current);
}

export function resolveReportedLatency(info) {
  const rates = new Map();
  for (const report of latencyReports(info)) {
    if (!Number.isFinite(report?.sampleRate) || report.sampleRate <= 0) continue;
    const candidates = reportCandidates(report);
    if (candidates.length) rates.set(report.sampleRate, [...(rates.get(report.sampleRate) || []), ...candidates]);
  }
  return Object.fromEntries([...rates].map(([rate, candidates]) => [rate, resolveReportsAtRate(candidates)]));
}

function normalizeTableCell(cell) {
  const modes = knownModes(cell || {});
  if (!(modes.length && Number.isFinite(cell?.samples)) && !cell?.conditions?.mode && !cell?.conditions?.modes?.length &&
    (modes.length < 2 || new Set(modes.map(latencyModeKey)).size === modes.length)) return cell;
  return resolveModeObservations([cell]) || cell;
}

export function resolveCatalogLatency(plugin) {
  const reported = resolveReportedLatency(plugin.latencyInfo);
  const raw = plugin.latency || {};
  const result = {};
  for (const rate of new Set([...Object.keys(raw), ...Object.keys(reported)])) {
    if (!latencyRate.test(rate)) continue;
    const cell = raw[rate];
    const fromReport = reported[rate];
    const sourcedCell = cell && raw.source && !cell.source && ((!cell.conflict && !cell.uncertain) || cell.variants?.length) ? { ...cell, source: raw.source } : cell;
    result[rate] = mergeLatencyCell(normalizeTableCell(sourcedCell), fromReport) || null;
  }
  return result;
}

export function latencyIssues(plugin) {
  return Object.entries(resolveCatalogLatency(plugin))
    .filter(([, cell]) => cell?.conflict || cell?.uncertain)
    .map(([rate, cell]) => ({
      rate: Number(rate), status: cell.conflict ? 'conflict' : 'uncertain', modes: cell.conflictingModes || []
    }));
}

export const latencyIssueRates = plugin => latencyIssues(plugin).map(issue => issue.rate);
