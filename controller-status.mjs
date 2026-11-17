export const CONTROLLER_STATUS_LABELS = {
  verified: 'Profil vérifié',
  unverified: 'Profil non vérifié',
  none: 'Aucun profil'
};

export const isInCollection = licenseStatus => ['owned', 'subscription'].includes(licenseStatus);

export function controllerProfileStatus(pluginId, manifest) {
  const link = manifest?.schemaVersion === 1 && Array.isArray(manifest.links)
    ? manifest.links.find(item => item?.pluginId === pluginId)
    : null;
  if (!link || !Array.isArray(link.profiles) || link.profiles.length === 0) return 'none';
  const verified = link.profiles.some(profile =>
    profile?.status === 'verified' &&
    Array.isArray(profile.variants) &&
    profile.variants.some(variant => variant?.status === 'verified')
  );
  return verified ? 'verified' : 'unverified';
}

export function collectionControllerStatus(pluginId, licenseStatus, scope, manifest) {
  if (scope !== 'owned' || !isInCollection(licenseStatus)) return null;
  return controllerProfileStatus(pluginId, manifest);
}

// Point d’entrée réutilisable pour une future proposition de création de profil.
// La présence dans le catalogue ou dans le manifeste ne suffit jamais.
export const canOfferProfileCreation = licenseStatus => isInCollection(licenseStatus);
