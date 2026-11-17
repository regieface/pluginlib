import { collectionStatus, mergeCollection, subscriptionKey } from './collection.mjs';

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function previewCollectionImport(source, current, plugins, plans) {
  const input = JSON.parse(source);
  if (!isRecord(input) ||
      !['status', 'owned', 'subscriptions'].some(key => Object.hasOwn(input, key)) ||
      (Object.hasOwn(input, 'status') && !isRecord(input.status)) ||
      ['owned', 'subscriptions', 'unmatchedLicenses'].some(key => Object.hasOwn(input, key) && !Array.isArray(input[key])) ||
      (input.subscriptions || []).some(plan => !isRecord(plan) || typeof plan.vendor !== 'string' || typeof plan.plan !== 'string') ||
      (input.unmatchedLicenses || []).some(license => !isRecord(license)) ||
      (Object.hasOwn(input, 'licenseDetails') && (!isRecord(input.licenseDetails) || !Object.values(input.licenseDetails).every(isRecord)))) {
    throw new Error('Fichier de collection non reconnu');
  }

  // Un export partiel ne doit pas effacer les informations de licence locales.
  const next = mergeCollection(current, input, plugins, plans);
  const previousUnmatched = current.unmatchedLicenses || [];
  const unmatched = new Set(previousUnmatched.map(license => JSON.stringify(license)));
  next.unmatchedLicenses = [...previousUnmatched];
  for (const license of input.unmatchedLicenses || []) {
    const key = JSON.stringify(license);
    if (unmatched.has(key)) continue;
    unmatched.add(key);
    next.unmatchedLicenses.push(license);
  }
  for (const [id, details] of Object.entries(input.licenseDetails || {})) {
    next.licenseDetails[id] = { ...current.licenseDetails?.[id], ...details };
  }

  const byId = new Map(plugins.map(plugin => [plugin.id, plugin]));
  for (const collection of [current, next]) {
    for (const id of [...Object.keys(collection.status), ...Object.keys(collection.licenseDetails || {})]) {
      if (!byId.has(id)) byId.set(id, { id, name: id });
    }
  }
  const added = [], modified = [];
  let unchanged = 0;
  for (const plugin of byId.values()) {
    const { id } = plugin;
    const before = collectionStatus(plugin, current, plans);
    const after = collectionStatus(plugin, next, plans);
    const previousDetails = current.licenseDetails?.[id];
    const nextDetails = next.licenseDetails[id];
    const detailsChanged = !same(previousDetails, nextDetails);
    const declaredBefore = current.status[id] || 'unknown';
    const declaredAfter = next.status[id] || 'unknown';
    const name = plugin.vendor ? `${plugin.name} · ${plugin.vendor}` : plugin.name;
    const change = { name, before, after, detailsChanged, declaredBefore, declaredAfter };
    if (before === 'unknown' && after !== 'unknown' && !previousDetails) added.push(change);
    else if (before !== after || detailsChanged || declaredBefore !== declaredAfter) modified.push(change);
    else if (before !== 'unknown' || previousDetails) unchanged++;
  }

  const previousPlans = new Map((current.subscriptions || []).map(plan => [subscriptionKey(plan), plan]));
  const subscriptions = next.subscriptions.filter(plan => !same(previousPlans.get(subscriptionKey(plan)), plan));
  return { next, added, modified, unchanged, subscriptions, unmatchedAdded: next.unmatchedLicenses.length - previousUnmatched.length };
}

export function bindCollectionImport({ input, dialog, prepare, show, apply, onInvalid }) {
  let pending;
  let selection = 0;
  input.addEventListener('change', async () => {
    const request = ++selection;
    pending = undefined;
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    try {
      const source = await file.text();
      if (request !== selection) return;
      const preview = prepare(source);
      show(preview);
      pending = preview.next;
      dialog.showModal();
    } catch {
      if (request !== selection) return;
      pending = undefined;
      onInvalid();
    }
  });
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    const next = pending;
    pending = undefined;
    dialog.close();
    if (event.submitter?.value === 'confirm' && next) apply(next);
  });
  dialog.addEventListener('cancel', () => { pending = undefined; });
}
