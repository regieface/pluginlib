import { isInCollection } from './controller-status.mjs';

const text = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
// La variante est toujours explicite, conformément au résolveur Controller.
export function controllerRequestOptions(pluginId, licenseStatus, scope, manifest) {
  if (scope !== 'owned' || !isInCollection(licenseStatus) || !text(pluginId) || manifest?.schemaVersion !== 1) return [];
  const links = manifest.links?.filter(link => link.pluginId === pluginId);
  if (links?.length !== 1) return [];
  const options = (links[0].profiles ?? []).flatMap(profile => {
    if (profile.status !== 'verified' || !text(profile.profileId) || !/^Profiles\/[^/]+\.json$/.test(profile.profilePath)) return [];
    return (profile.variants ?? []).filter(v => v.status === 'verified' &&
      [v.format, v.channelLayout, v.host?.application, v.host?.pluginName].every(text)).map(v => ({
      schemaVersion: 1, pluginId, licenseStatus,
      variant: { format: v.format, channelLayout: v.channelLayout, application: v.host.application,
        pluginName: v.host.pluginName, ...(v.host.testedVersion ? { testedVersion: v.host.testedVersion } : {}) }
    }));
  });
  return options.filter(option => options.filter(other => JSON.stringify(other.variant) === JSON.stringify(option.variant)).length === 1);
}

export function createControllerRequest(pluginId, licenseStatus, scope, manifest, variant) {
  const option = controllerRequestOptions(pluginId, licenseStatus, scope, manifest)
    .find(item => JSON.stringify(item.variant) === JSON.stringify(variant));
  if (!option) throw new Error('Demande Controller non autorisée ou variante indisponible');
  return option;
}
