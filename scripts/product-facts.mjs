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
  const sentences = text.match(/[^.!?\n]*(?:latency|latence)[^!?\n]*/gi) || [];
  for (const raw of sentences) {
    const excerpt = raw.trim().slice(0, 600);
    if (!excerpt || /not (?:a )?zero.latency|no latency (?:information|data)|latency (?:is )?(?:unknown|not (?:published|specified))/i.test(excerpt)) continue;
    if (/\b(?:Apollo|ASIO|audio interface|driver|buffer size|round.trip|monitoring)\b/i.test(excerpt)) continue;
    const zero = /\b(?:zero[- ]latency|latency[- ]free|no (?:additional |added |processing )?latency)\b/i.test(excerpt);
    const forward = [...excerpt.matchAll(/\b(?:latency|latence)\s*(?:\(samples\))?\s*(?:of|:|is|=|approximately|about)?\s*(\d+(?:[.,]\d+)?)\s*(samples?|ms|milliseconds?)\b/gi)];
    const backward = [...excerpt.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(samples?|ms|milliseconds?)\s*(?:of |processing )?(?:latency|latence)\b/gi)];
    const values = [...forward, ...backward].map((m) => ({ value: Number(m[1].replace(',', '.')), unit: /sample/i.test(m[2]) ? 'samples' : 'ms' }));
    if (!zero && !values.length) continue;
    const conditional = /(?:mode|oversampl|look.?ahead|linear.phase|minimum.phase|depending|variable|adjustable|up to|\blive\b)/i.test(excerpt);
    const rate = (excerpt.match(/(?:at|@|à)\s*(44[.,]1|48|88[.,]2|96)\s*kHz/i) || [])[1];
    const info = { zero, conditional, values, sampleRate: rate ? Number(rate.replace(',', '.')) : null, excerpt, url, checkedAt };
    const latency = {};
    if (zero && !conditional) { latency[48] = { samples: 0 }; latency[96] = { samples: 0 }; }
    else if (!conditional && values.length === 1 && values[0].unit === 'samples' && [48, 96].includes(info.sampleRate)) latency[info.sampleRate] = { samples: values[0].value };
    return { latencyInfo: info, ...(Object.keys(latency).length ? { latency } : {}) };
  }
  return {};
}
