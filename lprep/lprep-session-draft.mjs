export const SESSION_CHAIN_ROLES = Object.freeze(['insert', 'fx', 'monitoring']);
export const SESSION_FORMATS = Object.freeze(['mono', 'stereo']);
export const SESSION_SAMPLE_RATES = Object.freeze([48000, 96000]);

const clone = value => structuredClone(value);
const DEFAULT_COLORS = Object.freeze({ insert: '#6574d8', fx: '#35a8a3', monitoring: '#66a357' });

function newChain(role, idFactory) {
  return { draftChainId: idFactory('draft-chain'), role, name: '', inputFormat: 'stereo', outputFormat: 'stereo',
    presetRef: null, color: DEFAULT_COLORS[role], dlNumber: role === 'insert' ? 1 : null };
}

export function createSessionDraft({ idFactory, machineId = null, environmentProfileId,
  sampleRate = 48000 } = {}) {
  if (typeof idFactory !== 'function') throw new TypeError('Fabrique d’identifiants temporaires requise.');
  return { name: '', machineId, environmentProfileId, sampleRate,
    counts: { insert: 0, fx: 0, monitoring: 0 }, chains: [], extensions: {} };
}

export function planSessionChainCount(draft, role, count, idFactory) {
  if (!SESSION_CHAIN_ROLES.includes(role) || !Number.isSafeInteger(count) || count < 0) {
    throw new TypeError('Compteur de chaînes invalide.');
  }
  const current = draft.chains.filter(chain => chain.role === role);
  const removed = count < current.length ? current.slice(count) : [];
  const changed = removed.filter(chain => chain.name.trim() || chain.presetRef ||
    chain.inputFormat !== 'stereo' || chain.outputFormat !== 'stereo' ||
    chain.color !== DEFAULT_COLORS[role] || chain.dlNumber !== (role === 'insert' ? 1 : null));
  return { role, count, removed: clone(removed), confirmationRequired: changed.length > 0,
    changedDraftChainIds: changed.map(chain => chain.draftChainId), idFactory };
}

export function applySessionChainCount(draft, plan) {
  const result = clone(draft), roleChains = result.chains.filter(chain => chain.role === plan.role);
  while (roleChains.length < plan.count) roleChains.push(newChain(plan.role, plan.idFactory));
  roleChains.length = plan.count;
  result.counts[plan.role] = plan.count;
  result.chains = SESSION_CHAIN_ROLES.flatMap(role => role === plan.role ? roleChains :
    result.chains.filter(chain => chain.role === role));
  return result;
}

export function sessionDraftCapacity(profile) {
  const resources = profile?.virtualResources || [];
  const reserved = new Set((profile?.reservations || []).filter(value => value.exclusive).flatMap(value => value.resourceRefs));
  const count = direction => resources.filter(resource => resource.direction === `virtual-${direction}` &&
    resource.availability === 'available' && !reserved.has(resource.resourceId)).length;
  return { inputs: count('input'), outputs: count('output') };
}

export function sessionDraftNeeds(draft) {
  const channels = format => format === 'mono' ? 1 : format === 'stereo' ? 2 : 0;
  return { inputs: draft.chains.reduce((sum, chain) => sum + channels(chain.inputFormat), 0),
    outputs: draft.chains.reduce((sum, chain) => sum + channels(chain.outputFormat), 0) };
}

export function validateSessionDraft(draft, { machines = [], profiles = [], presets = [] } = {}) {
  const issues = [];
  const add = (path, code, message) => issues.push({ path, code, message });
  if (!draft.name.trim()) add('name', 'session-draft.name', 'Le nom de session est obligatoire.');
  if (draft.machineId !== null && !machines.some(machine => machine.machineId === draft.machineId)) {
    add('machineId', 'session-draft.machine', 'La machine sélectionnée n’existe plus.');
  }
  if (!profiles.some(profile => profile.environmentProfileId === draft.environmentProfileId)) {
    add('environmentProfileId', 'session-draft.environment', 'Le profil d’environnement est invalide.');
  }
  if (!SESSION_SAMPLE_RATES.includes(draft.sampleRate)) add('sampleRate', 'session-draft.sample-rate', 'Fréquence invalide.');
  const presetKeys = new Set(presets.map(preset => `${preset.presetId}@${preset.revision}`));
  for (const role of SESSION_CHAIN_ROLES) {
    const actual = draft.chains.filter(chain => chain.role === role).length;
    if (draft.counts[role] !== actual) add(`counts.${role}`, 'session-draft.count-mismatch',
      `Le compteur ${role} ne correspond pas aux chaînes préparées.`);
  }
  draft.chains.forEach((chain, index) => {
    const at = `chains.${chain.draftChainId}`;
    if (!chain.name.trim()) add(`${at}.name`, 'session-draft.chain-name', `Le nom de la chaîne ${index + 1} est obligatoire.`);
    if (!SESSION_CHAIN_ROLES.includes(chain.role)) add(`${at}.role`, 'session-draft.chain-role', 'Type de chaîne invalide.');
    if (!SESSION_FORMATS.includes(chain.inputFormat)) add(`${at}.inputFormat`, 'session-draft.input-format', 'Format d’entrée invalide.');
    if (!SESSION_FORMATS.includes(chain.outputFormat)) add(`${at}.outputFormat`, 'session-draft.output-format', 'Format de sortie invalide.');
    if (chain.presetRef && !presetKeys.has(`${chain.presetRef.presetId}@${chain.presetRef.revision}`)) {
      add(`${at}.presetRef`, 'session-draft.preset', 'Preset indisponible.');
    }
    if (chain.dlNumber !== null && (!Number.isSafeInteger(chain.dlNumber) || chain.dlNumber < 1)) {
      add(`${at}.dlNumber`, 'session-draft.dl', 'Le groupe DLY doit être un entier positif.');
    }
  });
  return issues;
}
