import { collectionStatus, matchesCollectionScope, normalizeCollection } from '../collection.mjs';
import { normalizeClassification } from '../classification.mjs';
import { currentLatency } from '../result-sorting.mjs';
import { classificationSearchText, classifiedTreatments, treatmentFacetValues } from '../treatment-navigation.mjs';

export async function loadCatalog() {
  async function readData(name) {
    const response = await fetch(new URL(`../data/${name}.json`, import.meta.url));
    if (!response.ok) throw new Error('Catalogue PluginLib indisponible.');
    return response.json();
  }
  const [{ plugins }, { plans = [] }] = await Promise.all([readData('plugins'), readData('subscriptions')]);
  return { plugins: plugins.map(normalizeClassification), plans };
}

function readStored(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function catalogEntries({ plugins, plans }, storage, scope) {
  const collection = normalizeCollection({
    status: readStored(storage, 'pluginlib.status.v2', {}),
    owned: readStored(storage, 'pluginlib.owned.v1', []),
    subscriptions: readStored(storage, 'pluginlib.subscriptions.v1', [])
  }, plugins, plans);
  return plugins.filter(plugin => !plugin.duplicateOf && !plugin.exclude &&
    matchesCollectionScope(collectionStatus(plugin, collection, plans), scope));
}

export function localThumbnail(image, catalogBase) {
  const url = thumbnailUrl(image, catalogBase);
  return url && new URL(url).origin === new URL(catalogBase).origin ? url : null;
}

export function thumbnailUrl(image, catalogBase) {
  if (typeof image !== 'string' || !image.trim()) return null;
  try {
    const url = new URL(image, catalogBase);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

const searchKey = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

export function filterCatalog(plugins, { query = '', treatment = '', family = '' } = {}) {
  const search = searchKey(query.trim());
  const scope = treatment ? { include: [treatment], exclude: [] } : undefined;
  return plugins.filter(plugin =>
    (!treatment || classifiedTreatments(plugin).some(fact => fact.type === treatment)) &&
    (!family || treatmentFacetValues(plugin, 'treatmentFamily', scope).includes(family)) &&
    (!search || searchKey([plugin.name, plugin.vendor, ...(plugin.aliases || []),
      classificationSearchText(plugin)].join(' ')).includes(search)));
}

export function sessionLatency(plugin, sampleRate) {
  const unknown = { label: 'Latence inconnue', detail: '' };
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { ...unknown, detail: 'Fréquence de session inconnue.' };
  }
  const rate = sampleRate / 1000;
  const frequency = `${rate.toLocaleString('fr-FR')} kHz`;
  const reading = currentLatency(plugin, rate);
  if (reading?.conflict || reading?.uncertain) return { ...unknown, detail: `Latence à confirmer à ${frequency}.` };
  const documented = (value, source) => (value.source || source) &&
    !['pending', 'unverified', 'estimated'].includes(value.confidence) && Number.isFinite(value.samples);
  const format = value => `${value.samples.toLocaleString('fr-FR')} ${value.unit === 'ms' ? 'ms' : 'éch.'}`;
  const modes = (reading?.variants || []).filter(mode => documented(mode, reading.source));
  if (modes.length) {
    const values = [...new Set(modes.map(format))];
    return { label: `${values.join(' / ')} selon le mode`,
      detail: `${frequency} · ${modes.map(mode => `${mode.label} : ${format(mode)}`).join(' · ')}` };
  }
  if (!reading || !documented(reading)) return { ...unknown, detail: `Aucune mesure documentée à ${frequency}.` };
  const conditions = Object.entries(reading.conditions || {}).filter(([, value]) => value !== false);
  return { label: `${format(reading)}${conditions.length || reading.zeroMode ? ' selon conditions' : ''}`,
    detail: [frequency, ...conditions.map(([key, value]) => `${key} : ${value}`)].join(' · ') };
}

export function existingVariants(project, pluginId) {
  const variants = new Map();
  for (const session of project.sessions) {
    for (const { catalogRef, variantRef } of session.pluginInstances) {
      if (catalogRef.pluginId === pluginId && variantRef) {
        variants.set(JSON.stringify([variantRef.variantId, variantRef.revision]), variantRef);
      }
    }
  }
  return [...variants.values()];
}

export function instancePluginDetail(instance, catalog) {
  const fallback = instance.catalogRef?.fallback;
  const variant = instance.variantRef;
  return {
    plugin: {
      ...catalog,
      name: instance.displayName || catalog?.name || fallback?.name || instance.instanceId,
      vendor: catalog?.vendor || fallback?.vendor
    },
    instanceRows: [
      ['Nom au catalogue', instance.displayName && catalog?.name !== instance.displayName ? catalog?.name : undefined],
      ['Instance', instance.instanceId],
      ['Variante technique', variant?.fallback?.name || variant?.variantId],
      ['Identifiant de variante', variant?.fallback?.name ? variant.variantId : undefined],
      ['Révision', variant?.revision == null ? undefined : String(variant.revision)],
      ['Résolution', instance.resolutionStatus === 'unresolved' ? 'Variante à résoudre' : undefined],
      ['Bypass', typeof instance.metadata?.bypassed === 'boolean' ? (instance.metadata.bypassed ? 'Actif' : 'Inactif') : undefined]
    ]
  };
}

export function sessionRows(session, catalogById) {
  if (!session) return [];
  const chains = new Map(session.chains.map(chain => [chain.chainId, chain]));
  const instances = new Map(session.pluginInstances.map(instance => [instance.instanceId, instance]));
  const groups = new Map(session.compensationGroups.map(group => [group.compensationGroupId, group.name]));
  function plugin(id) {
    const instance = instances.get(id);
    const catalog = catalogById.get(instance?.catalogRef?.pluginId);
    return {
      id,
      name: instance?.displayName || catalog?.name || instance?.catalogRef?.fallback?.name || id,
      unresolved: instance?.resolutionStatus === 'unresolved' && instance.variantRef === null,
      bypassed: instance?.metadata?.bypassed === true,
      image: catalog?.image
    };
  }
  return session.chainOrder.map(id => {
    const chain = chains.get(id);
    return {
      chain,
      group: groups.get(chain.compensationGroupId),
      plugins: chain.pluginOrder.map(plugin),
      independent: chain.presentationLinks.map(plugin)
    };
  });
}
