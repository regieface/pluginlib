import { collectionStatus } from '../collection.mjs';

const clone = value => structuredClone(value);

export function resolveSharedReference(ref, { kind, resources = [], idKey, requireRevision = false } = {}) {
  const id = ref?.[idKey], resource = resources.find(value => value[idKey] === id);
  const pinned = !requireRevision || ((Number.isInteger(ref?.revision) && ref.revision > 0) || typeof ref?.revision === 'string');
  if (!id || !pinned) return { status: 'invalid', kind, reference: clone(ref), diagnostics: [{ code: 'reference.invalid' }] };
  if (!resource) return { status: 'unavailable', kind, reference: clone(ref), display: clone(ref.fallback || {}), diagnostics: [{ code: 'reference.unavailable' }] };
  if (requireRevision && resource.revision !== ref.revision) return { status: 'revision-unavailable', kind,
    reference: clone(ref), display: clone(ref.fallback || {}), diagnostics: [{ code: 'reference.revision-unavailable' }] };
  return { status: 'resolved', kind, reference: clone(ref), resource: clone(resource), display: clone(resource) , diagnostics: [] };
}

export function assessPluginAvailability(plugin, { collection, plans = [], installations = [], machineId } = {}) {
  const licenseStatus = collection ? collectionStatus(plugin, collection, plans) : 'unknown';
  const installed = installations.some(value => value.machineId === machineId && value.pluginId === plugin.id);
  const diagnostics = [];
  if (!['owned', 'subscription'].includes(licenseStatus)) diagnostics.push({ code: 'plugin.not-licensed', severity: 'warning' });
  if (!installed) diagnostics.push({ code: 'plugin.not-installed', severity: 'warning' });
  return { pluginId: plugin.id, machineId, licenseStatus, installed, usable: installed && ['owned', 'subscription'].includes(licenseStatus), diagnostics };
}
