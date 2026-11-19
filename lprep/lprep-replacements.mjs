import { isStableId } from './lprep-identifiers.mjs';

const clone = value => structuredClone(value);
const error = (path, code, message) => ({ severity: 'error', path, code, message });

export function createTemporaryReplacement({ replacementId, sessionId, machineId, originalInstanceId,
  replacementCatalogRef, replacementVariantRef, installationRef = null, portMapping = null,
  state = 'inactive', validation = { status: 'pending', issues: [] }, extensions = {} } = {}) {
  return { replacementId, sessionId, machineId, originalInstanceId,
    replacementCatalogRef: clone(replacementCatalogRef), replacementVariantRef: clone(replacementVariantRef),
    installationRef: clone(installationRef), portMapping: clone(portMapping), state,
    validation: clone(validation), extensions: clone(extensions) };
}

function validPinnedRef(ref, idKey) {
  return ref && isStableId(ref[idKey]) && ((Number.isInteger(ref.revision) && ref.revision > 0) || isStableId(ref.revision));
}

export function validateTemporaryReplacements(session, { path = 'session', installations = null } = {}) {
  const issues = [], replacements = session?.temporaryReplacements;
  if (replacements === undefined) return issues;
  if (!Array.isArray(replacements)) return [error(`${path}.temporaryReplacements`, 'replacement.array', 'Un tableau est requis.')];
  const instances = new Set((session.pluginInstances || []).map(value => value.instanceId));
  const installationIndex = new Map((installations || []).map(value => [value.installationId, value]));
  const ids = new Set(), active = new Set();
  replacements.forEach((replacement, index) => {
    const at = `${path}.temporaryReplacements[${index}]`;
    if (!isStableId(replacement?.replacementId) || ids.has(replacement.replacementId)) issues.push(error(`${at}.replacementId`, 'replacement.id', 'Identifiant unique requis.'));
    ids.add(replacement?.replacementId);
    if (replacement?.sessionId !== session.sessionId) issues.push(error(`${at}.sessionId`, 'replacement.session', 'Session incorrecte.'));
    if (!isStableId(replacement?.machineId)) issues.push(error(`${at}.machineId`, 'replacement.machine', 'Machine cible requise.'));
    if (!instances.has(replacement?.originalInstanceId)) issues.push(error(`${at}.originalInstanceId`, 'replacement.instance', 'Instance originale introuvable.'));
    if (!validPinnedRef(replacement?.replacementVariantRef, 'variantId')) issues.push(error(`${at}.replacementVariantRef`, 'replacement.variant', 'Variante épinglée requise.'));
    if (!replacement?.replacementCatalogRef || !isStableId(replacement.replacementCatalogRef.pluginId)) issues.push(error(`${at}.replacementCatalogRef`, 'replacement.plugin', 'Plugin de remplacement requis.'));
    if (!['inactive', 'active'].includes(replacement?.state)) issues.push(error(`${at}.state`, 'replacement.state', 'État invalide.'));
    if (!replacement?.portMapping || !Array.isArray(replacement.portMapping.inputs) || !Array.isArray(replacement.portMapping.outputs)) {
      issues.push(error(`${at}.portMapping`, 'replacement.port-mapping', 'Mapping explicite des ports requis.'));
    }
    if (replacement?.state === 'active') {
      const key = `${replacement.machineId}:${replacement.originalInstanceId}`;
      if (active.has(key)) issues.push(error(at, 'replacement.active-conflict', 'Une substitution active existe déjà pour cette instance et cette machine.'));
      active.add(key);
      if (replacement.validation?.status !== 'valid') issues.push(error(`${at}.validation`, 'replacement.not-validated', 'Un remplacement actif doit être validé.'));
      if (replacement.installationRef) {
        const installation = installationIndex.get(replacement.installationRef.installationId);
        if (Array.isArray(installations) && (!installation || installation.machineId !== replacement.machineId ||
          installation.variantId !== replacement.replacementVariantRef.variantId)) {
          issues.push(error(`${at}.installationRef`, 'replacement.installation', 'Installation absente, sur une autre machine ou pour une autre variante.'));
        }
      }
    }
  });
  return issues;
}

export function resolveEffectivePlugin(project, sessionId, machineId, instanceId, { installations = [] } = {}) {
  const session = project?.sessions?.find(value => value.sessionId === sessionId);
  if (!session) return { status: 'error', diagnostics: [error('sessionId', 'replacement.session', 'Session introuvable.')] };
  const instance = session.pluginInstances.find(value => value.instanceId === instanceId);
  if (!instance) return { status: 'error', diagnostics: [error('instanceId', 'replacement.instance', 'Instance introuvable.')] };
  const diagnostics = validateTemporaryReplacements(session, { installations });
  if (diagnostics.length) return { status: 'error', diagnostics };
  const replacement = (session.temporaryReplacements || []).find(value => value.state === 'active' &&
    value.machineId === machineId && value.originalInstanceId === instanceId);
  if (!replacement) return { status: 'original', instance: clone(instance), diagnostics: [] };
  return { status: 'replacement', originalInstance: clone(instance), replacement: clone(replacement),
    effective: { catalogRef: clone(replacement.replacementCatalogRef), variantRef: clone(replacement.replacementVariantRef),
      installationRef: clone(replacement.installationRef), portMapping: clone(replacement.portMapping) }, diagnostics: [] };
}
