const storageKeys = {
  status: 'pluginlib.status.v2',
  owned: 'pluginlib.owned.v1',
  subscriptions: 'pluginlib.subscriptions.v1',
  unmatchedLicenses: 'pluginlib.unmatchedLicenses.v1',
  licenseDetails: 'pluginlib.licenseDetails.v1'
};

export function isCollectionStorageKey(key) {
  return key === null || Object.values(storageKeys).includes(key);
}

export function readCollectionStorage(storage) {
  function read(field, fallback) {
    try { return JSON.parse(storage?.getItem(storageKeys[field])) ?? fallback; }
    catch { return fallback; }
  }
  const status = read('status', {});
  const owned = read('owned', []);
  const subscriptions = read('subscriptions', []);
  const unmatchedLicenses = read('unmatchedLicenses', []);
  const licenseDetails = read('licenseDetails', {});
  return {
    status: status && typeof status === 'object' && !Array.isArray(status) ? status : {},
    owned: Array.isArray(owned) ? owned : [],
    subscriptions: Array.isArray(subscriptions) ? subscriptions : [],
    unmatchedLicenses: Array.isArray(unmatchedLicenses) ? unmatchedLicenses : [],
    licenseDetails: licenseDetails && typeof licenseDetails === 'object' && !Array.isArray(licenseDetails) ? licenseDetails : {}
  };
}

export function writeCollectionStorage(storage, collection) {
  for (const field of ['status', 'subscriptions', 'unmatchedLicenses', 'licenseDetails']) {
    const value = JSON.stringify(collection[field]);
    const key = storageKeys[field];
    if (storage.getItem(key) !== value) storage.setItem(key, value);
  }
}
