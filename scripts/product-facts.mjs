import { latencyReports, presentLatencyInfo, resolveReportedLatency } from '../latency-resolution.mjs';

const plain = (html = '') => html.replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&(?:euro|#8364);/gi, '€').replace(/&(?:pound|#163);/gi, '£').replace(/\s+/g, ' ').trim();
const number = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function normalizePricing({ current, regular, currency, url, checkedAt, isRange = false }) {
  const amount = number(current), list = number(regular);
  if (amount === null || !currency) return null;
  const promo = list !== null && list > amount;
  return { normal: promo ? list : amount, promo: promo ? amount : null, currency, isRange, url, checkedAt, extractionVersion: 2 };
}

export function fullLicenseVariant(product) {
  const variants=(product.variants||[]).filter(v=>! /\b(?:edu|academic|education|upgrade|update|crossgrade|subscription|monthly|annual|rent|trial)\b/i.test(v.title||''));
  const full=variants.filter(v=>/^(?:Default Title|Full(?: (?:version|licen[cs]e))?)$/i.test(v.title||'') || v.title===product.title);
  return full.length===1 ? full[0] : variants.length===1 ? variants[0] : null;
}

export function extractPricing({ html = '', offer, currency: hint, url, checkedAt }) {
  let currency = offer?.priceCurrency || hint || null;
  let current = offer?.price ?? offer?.lowPrice;
  let regular = null;
  for (const spec of [].concat(offer?.priceSpecification || [])) {
    if (/strikethrough|listprice|regular/i.test(spec.priceType || '')) regular = spec.price;
  }
  // Limiter l'analyse HTML au prix du produit, sans utiliser les suggestions/bundles.
  const money = (s) => {
    const t = plain(s);
    const m = t.match(/(?:€|£|\$|EUR|USD|GBP)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:€|£|\$|EUR|USD|GBP)/i);
    return m ? number(m[1] || m[2]) : null;
  };
  const blocks = [...html.matchAll(/<(p|div|span)\b[^>]*class=["'][^"']*(?:price)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[0]);
  const block = blocks.find((b) => money(b) !== null) || '';
  const blockText = plain(block);
  currency ||= blockText.includes('€') ? 'EUR' : blockText.includes('£') ? 'GBP' : /\bUSD\b/.test(blockText) ? 'USD' : null;
  const del = (block.match(/<del\b[^>]*>([\s\S]*?)<\/del>/i) || [])[1];
  const ins = (block.match(/<ins\b[^>]*>([\s\S]*?)<\/ins>/i) || [])[1];
  if (del && ins) { regular = money(del); current = money(ins); }
  const regularBlock = (html.match(/<(p|div|span)\b[^>]*class=["'][^"']*(?:regularPrice|regular-price|price-item--regular)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i) || [])[0];
  const saleBlock = (html.match(/<(p|div|span)\b[^>]*class=["'][^"']*(?:discountedPrice|sale-price|price-item--sale)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i) || [])[0];
  if (regularBlock && saleBlock && money(regularBlock) !== null && money(saleBlock) !== null) {
    regular = money(regularBlock); current = money(saleBlock);
  }
  if (current === undefined || current === null) current = money(block);
  return normalizePricing({ current, regular, currency, url, checkedAt, isRange: offer?.lowPrice !== undefined && offer?.highPrice !== offer?.lowPrice });
}

export function extractPublishedLatency(text = '', url, checkedAt) {
  const reports = [];
  const latency = {};
  for (const raw of text.split(/[.!?](?=\s|$)|\n/)) {
    const excerpt = raw.trim().slice(0, 600);
    if (!excerpt || /not (?:a )?zero.latency|no latency (?:information|data)|latency (?:is )?(?:unknown|not (?:published|specified))/i.test(excerpt)) continue;
    if (/\b(?:Apollo|ASIO|audio interface|driver|buffer size|round.trip|monitoring)\b/i.test(excerpt)) continue;
    const zero = zeroAnnouncement.test(excerpt);
    const rates = new Set([...excerpt.matchAll(/(?:\bat\b|@|à)\s*(\d+(?:[.,]\d+)?)\s*kHz\b/gi)]
      .map(match => Number(match[1].replace(',', '.'))));
    const statedRate = rates.size === 1 ? [...rates][0] : null;
    const scoped = /(?:mode|oversampl|look.?ahead|linear.phase|minimum.phase|depending|variable|adjustable|up to|approximately|about|\blive\b|\bstudio\b)/i.test(excerpt);
    const standalone = /^(\d+(?:[.,]\d+)?)\s*(samples?|ms|milliseconds?)\s*(?:at|@|à)\s*\d+(?:[.,]\d+)?\s*kHz$/i.exec(excerpt);
    const namedModes = [...excerpt.matchAll(/\b(\d+)\s+samples?\s+(?:in\s+)?(Live|Studio)(?:\s+mode)?\b/gi)];
    const forward = [...excerpt.matchAll(/\b(?:latency|latence)\s*(?:\(samples\))?\s*(?:of|:|is|=|approximately|about)?\s*(\d+(?:[.,]\d+)?)\s*(samples?|ms|milliseconds?)\b/gi)];
    const backward = [...excerpt.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(samples?|ms|milliseconds?)\s*(?:of |processing )?(?:latency|latence)\b/gi)];
    const modes = namedModes.map(match => ({ label: match[2], samples: Number(match[1]) }));
    const values = [...forward, ...backward, ...(standalone ? [standalone] : [])]
      .map(match => ({ value: Number(match[1].replace(',', '.')), unit: /sample/i.test(match[2]) ? 'samples' : 'ms' }));
    if (!zero && !values.length && !modes.length) continue;
    const conditional = scoped || modes.length > 0;
    const sharedRate = modes.length && /(?:\bat\b|@|à)\s*\d+(?:[.,]\d+)?\s*kHz\s*$/i.test(excerpt) &&
      namedModes.every(match => !/kHz/i.test(excerpt.slice(0, match.index)));
    const numericRate = /\b(?:samples?|ms|milliseconds?)(?:\s+(?:of\s+)?(?:latency|latence))?\s*(?:at|@|à)\s*\d+(?:[.,]\d+)?\s*kHz\b/i.test(excerpt);
    const sampleRate = (modes.length ? sharedRate : !values.length || numericRate) ? statedRate : null;
    reports.push({ zero, conditional, values, sampleRate, excerpt, url, checkedAt, ...(modes.length ? { modes } : {}) });

    if (![48, 96].includes(sampleRate)) continue;
    const cell = sharedRate ? { samples: null, variants: modes, note: excerpt } :
      numericRate && !conditional && values.length === 1 && values[0].unit === 'samples' && Number.isInteger(values[0].value)
        ? { samples: values[0].value } : undefined;
    if (!cell) continue;
    if (!latency[sampleRate]) latency[sampleRate] = cell;
  }
  if (!reports.length) return {};
  const resolved = resolveReportedLatency({ reports });
  const latencyInfo = presentLatencyInfo({ reports }, resolved);
  for (const [rate, cell] of Object.entries(resolved)) {
    if (cell.conflict || cell.uncertain) latency[rate] = cell;
    else if (latency[rate]?.variants && cell.variants) latency[rate].variants = cell.variants.map(({ source, ...mode }) => mode);
  }
  return { latencyInfo, ...(Object.keys(latency).length ? { latency } : {}) };
}

const zeroAnnouncement = /\b(?:zero[- ]latency|latency[- ]free|no (?:(?:additional|added|processing) )?latency)\b/i;
const sourcedReport = report => /^https?:\/\//i.test(report?.url || '') &&
  typeof report.excerpt === 'string' && report.excerpt.trim().length > 0;
const globalReport = report => report.conditional === false && !report.mode &&
  !report.modes?.length && !Object.keys(report.conditions || {}).length;

function hasLegacyZeroOrigin(info, reports) {
  // The former extractor copied an unconditional, sourced textual announcement
  // to both frequencies. Without that provenance the pair alone proves nothing.
  if (!info) return false;
  const candidates = info.reports?.length ? reports.filter(report => report.values?.length === 0) : [info];
  return candidates.some(report => globalReport(report) && report.zero === true &&
    Array.isArray(report.values) && sourcedReport(report) && Number.isFinite(Date.parse(report.checkedAt)) &&
    zeroAnnouncement.test(report.excerpt) && extractPublishedLatency(report.excerpt, report.url).latencyInfo?.zero === true);
}

export function discardSyntheticLatency(plugin) {
  const { latency, latencyInfo: info } = plugin;
  if (!latency || latency.source) return;
  const pair = [48, 96];
  if (!pair.every(rate => latency[rate]?.samples === 0 && Object.keys(latency[rate]).length === 1)) return;

  const reports = latencyReports(info);
  const reviewed = plugin.featureEvidence?.['opt:zl'];
  const independent = ['reviewed-source', 'latency-table'].includes(reviewed?.method) && reviewed.url;
  const legacyOrigin = hasLegacyZeroOrigin(info, reports);
  const retained = { ...latency };
  const resolved = resolveReportedLatency(info);
  for (const rate of pair) {
    const atRate = reports.filter(report => report.sampleRate === rate);
    const numeric = atRate.filter(report => report.values?.length);
    const reading = resolved[rate];
    const corroborated = reading?.samples === 0 && !reading.unit && !reading.conditions &&
      !reading.conflict && !reading.uncertain && reading.source;
    if (corroborated && numeric.some(report => sourcedReport(report) && globalReport(report) &&
      report.values.some(value => value.unit === 'samples' && value.value === 0))) continue;
    // Unattributed or conditional numeric evidence may refer to this zero.
    // Keep the original assertion in history but out of the global ZL badge.
    const unclear = numeric.length > 0 || atRate.some(report => report.modes?.length) || independent || !legacyOrigin || reports.some(report =>
      report.sampleRate == null && (report.values?.length || report.modes?.length));
    if (unclear) {
      retained[rate] = {
        samples: null, conflict: true, note: 'Latence à confirmer : origine ou portée du zéro historique incertaine.',
        history: [latency[rate]]
      };
    } else {
      delete retained[rate];
    }
  }
  if (Object.keys(retained).length) plugin.latency = retained;
  else delete plugin.latency;
}
