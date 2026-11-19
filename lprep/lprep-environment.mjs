import { isStableId } from './lprep-identifiers.mjs';

export const VIRTUAL_DIRECTIONS = new Set(['virtual-input', 'virtual-output']);
export const RESOURCE_AVAILABILITY = new Set(['available', 'unavailable', 'unknown']);

const clone = value => structuredClone(value);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function virtualResourceId(sessionId, direction, channel) {
  if (!isStableId(sessionId)) throw new TypeError('Identifiant de session requis.');
  if (!VIRTUAL_DIRECTIONS.has(direction)) throw new TypeError('Direction virtuelle inconnue.');
  if (!Number.isInteger(channel) || channel < 1) throw new TypeError('Numéro de canal virtuel invalide.');
  return `${sessionId}/${direction}:${channel}`;
}

export function reservationId(sessionId, purpose) {
  if (!isStableId(sessionId) || !isStableId(purpose)) throw new TypeError('Réservation invalide.');
  return `reservation:${sessionId}:${purpose}`;
}

function profileResourceId(profileId, direction, channel) {
  return `${profileId}/${direction}:${channel}`;
}

function resourceDefinition(ownerId, direction, channel) {
  const id = ownerId.startsWith('session:') ? virtualResourceId(ownerId, direction, channel) :
    profileResourceId(ownerId, direction, channel);
  return { resourceId: id, direction, channelNumber: channel, channelCount: 1, channelLayout: 'mono',
    label: `${direction === 'virtual-input' ? 'Entrée' : 'Sortie'} ${channel}`, availability: 'available', extensions: {} };
}

export function createDefaultEnvironmentProfile({ environmentProfileId = 'environment-profile:default-32',
  revision = 1, name = '32 entrées / 32 sorties' } = {}) {
  const virtualResources = ['virtual-input', 'virtual-output']
    .flatMap(direction => Array.from({ length: 32 }, (_, index) => resourceDefinition(environmentProfileId, direction, index + 1)));
  const musicOutputs = [31, 32].map(channel => profileResourceId(environmentProfileId, 'virtual-output', channel));
  return {
    environmentProfileId, revision, name, virtualResources,
    reservations: [{ reservationId: `${environmentProfileId}/reservation:music-outputs`, resourceRefs: musicOutputs,
      purpose: 'music', exclusive: true, provenance: { kind: 'environment-profile' }, extensions: {} }],
    allocationPolicy: { rolePriority: ['insert', 'fx', 'monitoring'], preferOddEvenStereo: true,
      allowManualPlacement: true, lowestAvailableFirst: true },
    musicPolicy: { reservedOutputs: [31, 32], enabledByDefault: false },
    metadata: {}, extensions: {}
  };
}

export function instantiateEnvironmentProfile(profile, sessionId, { copiedAt = new Date().toISOString() } = {}) {
  const issues = validateEnvironmentProfile(profile);
  if (issues.some(item => item.severity === 'error')) throw new EnvironmentValidationError(issues);
  if (!isStableId(sessionId)) throw new TypeError('Identifiant de session requis.');
  const resourceMap = new Map();
  const resources = profile.virtualResources.map(resource => {
    const copy = clone(resource);
    copy.resourceId = virtualResourceId(sessionId, resource.direction, resource.channelNumber);
    copy.sessionId = sessionId;
    resourceMap.set(resource.resourceId, copy.resourceId);
    return copy;
  });
  const reservations = profile.reservations.map(reservation => ({ ...clone(reservation),
    reservationId: reservationId(sessionId, reservation.purpose), sessionId,
    resourceRefs: reservation.resourceRefs.map(ref => resourceMap.get(ref)) }));
  const sourceRef = { environmentProfileId: profile.environmentProfileId, revision: profile.revision,
    fallback: { name: profile.name } };
  const snapshot = deepFreeze({ sourceProfileId: profile.environmentProfileId, sourceRevision: profile.revision,
    copiedAt, virtualResources: resources, reservations, allocationPolicy: clone(profile.allocationPolicy),
    musicPolicy: clone(profile.musicPolicy), extensions: clone(profile.extensions || {}) });
  const configuration = { basedOnSnapshot: { sourceProfileId: profile.environmentProfileId,
    sourceRevision: profile.revision, copiedAt }, virtualResources: clone(resources), reservations: clone(reservations),
    allocationPolicy: clone(profile.allocationPolicy), musicPolicy: clone(profile.musicPolicy), localChanges: [], extensions: {} };
  return { environmentSourceRef: sourceRef, environmentSnapshot: snapshot,
    environmentConfiguration: configuration, musicRouting: { enabled: false, assignmentRefs: [], extensions: {} } };
}

export function freezeEnvironmentSnapshot(snapshot) {
  return deepFreeze(snapshot);
}

function issue(issues, path, code, message, severity = 'error') {
  issues.push({ severity, path, code, message });
}

function validRevision(value) {
  return (Number.isInteger(value) && value > 0) || isStableId(value);
}

function validateResources(resources, path, issues, { sessionId = null } = {}) {
  if (!Array.isArray(resources)) {
    issue(issues, path, 'environment.resources', 'Un tableau de ressources est requis.');
    return new Map();
  }
  const index = new Map(), channels = new Set();
  for (const [position, resource] of resources.entries()) {
    const at = `${path}[${position}]`;
    if (!isStableId(resource?.resourceId)) issue(issues, `${at}.resourceId`, 'environment.resource-id', 'Identifiant de ressource requis.');
    else if (index.has(resource.resourceId)) issue(issues, `${at}.resourceId`, 'environment.resource-duplicate', 'Ressource dupliquée.');
    else index.set(resource.resourceId, resource);
    if (!VIRTUAL_DIRECTIONS.has(resource?.direction)) issue(issues, `${at}.direction`, 'environment.resource-direction', 'Direction virtuelle invalide.');
    if (!Number.isInteger(resource?.channelNumber) || resource.channelNumber < 1) {
      issue(issues, `${at}.channelNumber`, 'environment.channel', 'Numéro de canal positif requis.');
    }
    const channelKey = `${resource?.direction}:${resource?.channelNumber}`;
    if (channels.has(channelKey)) issue(issues, at, 'environment.channel-duplicate', 'Canal virtuel dupliqué dans son espace.');
    channels.add(channelKey);
    if (resource?.channelCount !== 1) issue(issues, `${at}.channelCount`, 'environment.channel-count', 'Une ressource représente un canal virtuel.');
    if (!RESOURCE_AVAILABILITY.has(resource?.availability)) issue(issues, `${at}.availability`, 'environment.availability', 'Disponibilité invalide.');
    if (sessionId) {
      if (resource?.sessionId !== sessionId) issue(issues, `${at}.sessionId`, 'environment.resource-session', 'La ressource doit appartenir à sa session.');
      const expected = Number.isInteger(resource?.channelNumber) && VIRTUAL_DIRECTIONS.has(resource?.direction) ?
        virtualResourceId(sessionId, resource.direction, resource.channelNumber) : null;
      if (expected && resource.resourceId !== expected) issue(issues, `${at}.resourceId`, 'environment.resource-qualified', 'Identifiant de ressource mal qualifié.');
    }
  }
  return index;
}

function validateReservations(reservations, resources, path, issues, { sessionId = null } = {}) {
  if (!Array.isArray(reservations)) {
    issue(issues, path, 'environment.reservations', 'Un tableau de réservations est requis.');
    return new Map();
  }
  const index = new Map(), claimed = new Map();
  for (const [position, reservation] of reservations.entries()) {
    const at = `${path}[${position}]`;
    if (!isStableId(reservation?.reservationId)) issue(issues, `${at}.reservationId`, 'environment.reservation-id', 'Identifiant de réservation requis.');
    else if (index.has(reservation.reservationId)) issue(issues, `${at}.reservationId`, 'environment.reservation-duplicate', 'Réservation dupliquée.');
    else index.set(reservation.reservationId, reservation);
    if (sessionId && reservation?.sessionId !== sessionId) issue(issues, `${at}.sessionId`, 'environment.reservation-session', 'La réservation doit appartenir à sa session.');
    if (!isStableId(reservation?.purpose)) issue(issues, `${at}.purpose`, 'environment.reservation-purpose', 'But de réservation requis.');
    if (typeof reservation?.exclusive !== 'boolean') issue(issues, `${at}.exclusive`, 'environment.reservation-exclusive', 'Le caractère exclusif doit être explicite.');
    if (!Array.isArray(reservation?.resourceRefs) || reservation.resourceRefs.length === 0) {
      issue(issues, `${at}.resourceRefs`, 'environment.reservation-resources', 'Ressources réservées requises.');
      continue;
    }
    for (const ref of reservation.resourceRefs) {
      if (!resources.has(ref)) issue(issues, `${at}.resourceRefs`, 'environment.reservation-resource-missing', `Ressource introuvable : ${ref}`);
      if (reservation.exclusive && claimed.has(ref)) issue(issues, `${at}.resourceRefs`, 'environment.reservation-conflict', `Ressource déjà réservée par ${claimed.get(ref)}.`);
      if (reservation.exclusive) claimed.set(ref, reservation.reservationId);
    }
  }
  return index;
}

function validatePolicy(policy, path, issues) {
  if (!policy || typeof policy !== 'object' || !Array.isArray(policy.rolePriority)) {
    issue(issues, path, 'environment.policy', 'Politique d’allocation requise.');
    return;
  }
  if (new Set(policy.rolePriority).size !== policy.rolePriority.length ||
      !['insert', 'fx'].every(role => policy.rolePriority.includes(role)) ||
      policy.rolePriority.indexOf('insert') > policy.rolePriority.indexOf('fx')) {
    issue(issues, `${path}.rolePriority`, 'environment.role-priority', 'Les inserts doivent précéder les FX.');
  }
}

export function validateEnvironmentProfile(profile, { path = 'environmentProfile' } = {}) {
  const issues = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    issue(issues, path, 'environment.profile', 'Profil d’environnement requis.');
    return issues;
  }
  if (!isStableId(profile.environmentProfileId)) issue(issues, `${path}.environmentProfileId`, 'environment.profile-id', 'Identifiant de profil requis.');
  if (!validRevision(profile.revision)) issue(issues, `${path}.revision`, 'environment.profile-revision', 'Révision requise.');
  if (typeof profile.name !== 'string' || !profile.name.trim()) issue(issues, `${path}.name`, 'environment.profile-name', 'Nom requis.');
  const resources = validateResources(profile.virtualResources, `${path}.virtualResources`, issues);
  validateReservations(profile.reservations, resources, `${path}.reservations`, issues);
  validatePolicy(profile.allocationPolicy, `${path}.allocationPolicy`, issues);
  return issues;
}

export function validateSessionEnvironment(session, { path = 'session' } = {}) {
  const issues = [];
  const fields = ['environmentSourceRef', 'environmentSnapshot', 'environmentConfiguration', 'musicRouting'];
  const present = fields.filter(field => session?.[field] !== undefined && session?.[field] !== null);
  if (present.length === 0) return issues;
  if (present.length !== fields.length) {
    issue(issues, path, 'environment.incomplete', 'Source, snapshot, configuration et routing musical doivent être présents ensemble.');
    return issues;
  }
  const source = session.environmentSourceRef;
  if (!isStableId(source?.environmentProfileId) || !validRevision(source?.revision)) {
    issue(issues, `${path}.environmentSourceRef`, 'environment.source-ref', 'Référence de profil épinglée requise.');
  }
  if (typeof source?.fallback?.name !== 'string' || !source.fallback.name.trim()) {
    issue(issues, `${path}.environmentSourceRef.fallback`, 'environment.source-fallback', 'Nom de secours requis.');
  }
  const snapshot = session.environmentSnapshot, configuration = session.environmentConfiguration;
  if (snapshot?.sourceProfileId !== source?.environmentProfileId || snapshot?.sourceRevision !== source?.revision) {
    issue(issues, `${path}.environmentSnapshot`, 'environment.snapshot-source', 'Le snapshot doit identifier sa source.');
  }
  if (configuration?.basedOnSnapshot?.sourceProfileId !== snapshot?.sourceProfileId ||
      configuration?.basedOnSnapshot?.sourceRevision !== snapshot?.sourceRevision ||
      configuration?.basedOnSnapshot?.copiedAt !== snapshot?.copiedAt) {
    issue(issues, `${path}.environmentConfiguration.basedOnSnapshot`, 'environment.configuration-source', 'La configuration doit référencer son snapshot.');
  }
  const snapshotResources = validateResources(snapshot?.virtualResources, `${path}.environmentSnapshot.virtualResources`, issues,
    { sessionId: session.sessionId });
  validateReservations(snapshot?.reservations, snapshotResources, `${path}.environmentSnapshot.reservations`, issues,
    { sessionId: session.sessionId });
  validatePolicy(snapshot?.allocationPolicy, `${path}.environmentSnapshot.allocationPolicy`, issues);
  const resources = validateResources(configuration?.virtualResources, `${path}.environmentConfiguration.virtualResources`, issues,
    { sessionId: session.sessionId });
  validateReservations(configuration?.reservations, resources, `${path}.environmentConfiguration.reservations`, issues,
    { sessionId: session.sessionId });
  validatePolicy(configuration?.allocationPolicy, `${path}.environmentConfiguration.allocationPolicy`, issues);
  if (typeof session.musicRouting?.enabled !== 'boolean' || !Array.isArray(session.musicRouting?.assignmentRefs)) {
    issue(issues, `${path}.musicRouting`, 'environment.music-routing', 'État et références du routing musical requis.');
  }
  return issues;
}

export class EnvironmentValidationError extends Error {
  constructor(issues) {
    super(`Environnement L-Prep invalide (${issues.filter(item => item.severity === 'error').length} erreur(s)).`);
    this.name = 'EnvironmentValidationError';
    this.issues = clone(issues);
  }
}
