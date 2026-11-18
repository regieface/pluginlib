import { mergeCatalogLatency, mergeLatencyInfo } from './latency-resolution.mjs';
export { mergeCatalogLatency };

// Règles communes à la collecte et aux filtres. Une absence d'information n'est
// ni une incompatibilité, ni une preuve d'abandon.
export const PLATFORMS = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
export const CATALOG_STATUSES = {
  commercial: 'Commercialisé', free: 'Gratuit maintenu',
  superseded: 'Remplacé · ancienne version', upcoming: 'À paraître',
  discontinued: 'Abandonné', beta: 'Bêta / préversion', unknown: 'Statut à vérifier'
};

export function hasDocumentedLatency(plugin) {
  return !!plugin.latencyInfo || Object.values(plugin.latency || {}).some((l) => Number.isFinite(l?.samples) || l?.variants?.some((v) => Number.isFinite(v?.samples)));
}

// Migration des seuls doublons explicitement confirmés, jamais des versions différentes.
export function resolveCollectionAliases(status, plugins) {
  const result={...status};
  for(const p of plugins) for(const id of p.legacyIds||[]) {
    if(result[p.id]===undefined && result[id]!==undefined) result[p.id]=result[id];
    delete result[id];
  }
  return result;
}

export function formatPrice(amount, currency) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

export function isPriceStale(price, now = Date.now()) {
  const checked = Date.parse(price?.checkedAt);
  const expiry = Date.parse(price?.validUntil);
  return !!price?.stale || !Number.isFinite(checked) || now - checked >= 14 * 86400000
    || (Number.isFinite(expiry) && now >= expiry);
}

export function matchesCatalogFilters(plugin, platform = 'all', catalogStatus = 'active') {
  if (platform === 'unknown' ? plugin.platforms?.length : platform !== 'all' && !plugin.platforms?.includes(platform)) return false;
  const state = plugin.catalogStatus || 'unknown';
  if (catalogStatus === 'active') return !['discontinued', 'superseded', 'upcoming'].includes(state);
  return catalogStatus === 'all' || state === catalogStatus;
}

export function inferCatalogMetadata({ text = '', operatingSystem = '', price = null, url, checkedAt, listed = false }) {
  const platforms = [];
  const os = operatingSystem || text;
  const patterns = {
    macos: /\bmac\s?os(?:\s?x)?\b|\bmacintosh\b|\bmac\b|apple silicon|\bOS X\b/i,
    windows: /\bwindows\b|\bwin(?:32|64)\b/i,
    linux: /\blinux\b|\bubuntu\b/i
  };
  const evidence = [];
  for (const [id, pattern] of Object.entries(patterns)) {
    const match = pattern.exec(os);
    if (!match) continue;
    const sentence = os.slice(Math.max(0, match.index - 65), match.index + 110).replace(/\s+/g, ' ');
    const token = id === 'macos' ? 'mac(?:\\s?os(?:\\s?x)?)?' : id;
    if (new RegExp(`\\b(?:not (?:supported|available|compatible)(?: on| for| with)?|unsupported on|excluding)\\s+(?:\\w+\\s+){0,3}${token}\\b|\\b${token}\\b[^.!?\\n]{0,25}\\b(?:not supported|unsupported|not available)\\b`, 'i').test(sentence)) continue;
    platforms.push(id);
    evidence.push(sentence.trim());
  }
  // Un prix nul seul ne suffit pas : les essais et coupons sont souvent gratuits.
  const discontinued = /\bthis (?:product|plug-?in|software) (?:has been |is |was )(?:discontinued|no longer (?:available|supported|maintained)|abandoned)\b|\b(?:development|support) (?:for|of) this (?:product|plug-?in|software) (?:has ended|has ceased|is discontinued)\b|^\s*(?:discontinued|legacy product)\b/i.exec(text);
  const replaced = /\bthis (?:product|plug-?in|software) (?:has been|is|was) (?:replaced|superseded) (?:with|by)\s+(?:the\s+)?(?:new\s+)?([^.!?\n]{2,90})/i.exec(text);
  const free = /(?:\b(?:price|cost|licen[cs]e)\s*:\s*freeware\b|^\s*freeware\b|\b(?:free (?:audio |vst |audio effect )?plug-?in|free (?:download|and open.source)|open.source (?:audio |vst )?plug-?in)\b)/i.exec(text);
  const sale = /\b(?:add to (?:cart|basket)|buy now|purchase (?:now|license)|regular price)\b/i.exec(text);
  let catalogStatus = 'unknown';
  let statusExcerpt = '';
  if (replaced) { catalogStatus = 'superseded'; statusExcerpt = replaced[0]; }
  else if (discontinued) { catalogStatus = 'discontinued'; statusExcerpt = discontinued[0]; }
  else if (listed && price !== null && Number(price) > 0) { catalogStatus = 'commercial'; statusExcerpt = `Prix publié : ${price}`; }
  else if (listed && free && !/free[^.!?\n]{0,35}(?:trial|demo)/i.test(text)) { catalogStatus = 'free'; statusExcerpt = free[0]; }
  else if (listed && ((price !== null && Number(price) > 0) || sale)) {
    catalogStatus = 'commercial'; statusExcerpt = sale?.[0] || `Prix publié : ${price}`;
  }
  return {
    platforms, catalogStatus,
    ...(replaced ? { replacedBy: { name: replaced[1].replace(/\s+plug-?in\b.*$/i, '').trim() } } : {}),
    ...(platforms.length ? { platformEvidence: { url, checkedAt, excerpt: evidence.join(' · ').slice(0, 400) } } : {}),
    ...(statusExcerpt ? { statusEvidence: { url, checkedAt, excerpt: statusExcerpt.slice(0, 240) } } : {})
  };
}

export function resolveReplacements(plugins) {
  const key = (s) => s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const p of plugins) {
    if (!p.replacedBy?.name) continue;
    const next = plugins.find((other) => other.id !== p.id && other.vendor === p.vendor && key(other.name) === key(p.replacedBy.name));
    if (next) p.replacedBy = { name: next.name, id: next.id, url: next.url };
  }
  return plugins;
}

export function applyCatalogOverride(plugin, override, today = new Date().toISOString().slice(0, 10)) {
  if (!override) return plugin;
  if (override.catalogStatus === 'upcoming' && override.releaseDate && today >= override.releaseDate) {
    const { catalogStatus, statusEvidence, ...rest } = override;
    if (plugin.catalogStatus === 'upcoming') plugin.catalogStatus = 'unknown';
    return Object.assign(plugin, rest);
  }
  return Object.assign(plugin, override);
}

// Une collecte partielle conserve les produits antérieurs et leurs identifiants
// (les collections personnelles sont attachées à ces identifiants).
export function mergeVendorProducts(previous, collected) {
  const result = new Map(previous.map((p) => [p.id, p]));
  const urlKey = p => p.url && JSON.stringify([p.vendor, p.url.replace(/\/$/, '')]);
  const urlCounts = new Map();
  for (const p of collected) if (p.url) {
    const key = urlKey(p);
    urlCounts.set(key, (urlCounts.get(key) || 0) + 1);
  }
  const byURL = new Map();
  for (const p of previous) if (p.url) {
    const key = urlKey(p);
    byURL.set(key, byURL.has(key) ? null : p);
  }
  for (const product of collected) {
    const key = urlKey(product);
    const old = result.get(product.id) || (urlCounts.get(key) === 1 && byURL.get(key));
    const combined = { ...old, ...product, id: old?.id || product.id };
    if (!product.platforms?.length && old?.platforms?.length) {
      combined.platforms = old.platforms;
      combined.platformEvidence = old.platformEvidence;
    }
    if ((!product.catalogStatus || product.catalogStatus === 'unknown') && old?.catalogStatus) {
      combined.catalogStatus = old.catalogStatus;
      combined.statusEvidence = old.statusEvidence;
    }
    if (old) {
      for (const key of ['url', 'image', 'description', 'pricing', 'source']) {
        if ((product[key] == null || product[key] === '') && Object.hasOwn(old, key)) combined[key] = old[key];
      }
      if (old.latencyInfo && product.latencyInfo) combined.latencyInfo = mergeLatencyInfo(old.latencyInfo, product.latencyInfo);
      if (old.latency || product.latency) combined.latency = mergeCatalogLatency(old.latency, product.latency);
      if (old.featureEvidence && product.featureEvidence) {
        combined.featureEvidence = { ...old.featureEvidence, ...product.featureEvidence };
        for (const [tag, evidence] of Object.entries(old.featureEvidence)) {
          if (evidence?.method === 'reviewed-source' && evidence.url) combined.featureEvidence[tag] = evidence;
        }
      }
      if (old.aliases || product.aliases || (old.name && old.name !== combined.name)) {
        combined.aliases = [...new Set([...(old.aliases || []), ...(product.aliases || []),
          ...(old.name && old.name !== combined.name ? [old.name] : [])])];
      }
      for (const key of ['classification', 'legacyIds', 'duplicateOf', 'exclude']) {
        if (Object.hasOwn(old, key)) combined[key] = old[key];
      }
    }
    result.set(combined.id, combined);
  }
  return [...result.values()];
}
