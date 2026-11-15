// Latences officielles Waves : https://www.waves.com/support/tech-specs/plugin-latency
// La page embarque un objet JSON {"latency":[{documentName, native44, native48, native88, native96, ...}]}
// dont les valeurs sont des chaînes (nombre de samples, ou texte décrivant plusieurs variantes).
import { stripHtml, slug } from './parse.mjs';

function sliceArray(text, from) {
  const start = text.indexOf('[', from);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export function parseCell(raw) {
  if (raw == null || raw === '') return null;
  const txt = stripHtml(String(raw));
  if (/^\d+$/.test(txt)) return { samples: Number(txt) };
  const variants = [];
  for (const m of txt.matchAll(/([^:;\n]{1,60}?)\s*:\s*(\d+)\s*(?:samples?)?/gi)) variants.push({ label: m[1].trim(), samples: Number(m[2]) });
  return { samples: null, variants: variants.length ? variants : undefined, note: txt };
}

export function parseWavesLatency(html) {
  let rows = [];
  const src = html.includes('"latency"') ? html : html.replace(/&quot;/g, '"');
  const at = src.indexOf('"latency"');
  if (at >= 0) {
    const arr = sliceArray(src, at);
    if (arr) { try { rows = JSON.parse(arr); } catch { rows = []; } }
  }
  if (!rows.length) {
    for (const m of src.matchAll(/\{[^{}]*"documentName"[^{}]*\}/g)) { try { rows.push(JSON.parse(m[0])); } catch { /* ignoré */ } }
  }
  return rows.filter((r) => r && r.documentName).map((r) => ({
    name: stripHtml(r.documentName),
    latency: {
      '44.1': parseCell(r.native44), 48: parseCell(r.native48),
      '88.2': parseCell(r.native88), 96: parseCell(r.native96),
      source: 'https://www.waves.com/support/tech-specs/plugin-latency'
    }
  }));
}

const STOP = /\b(waves|plugin|plug-in|compressor|limiter|equalizer|eq|the)\b/g;
export const norm = (s) => slug(s.replace(/[™®]/g,'')).replace(/-/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim();

export function matchWaves(products, rows) {
  const used = new Set();
  let matched = 0;
  const rowsN = rows.map((r) => ({ r, n: norm(r.name), s: slug(r.name) }));
  for (const p of products) {
    const pn = norm(p.name), ps = slug(p.name);
    let best = rowsN.find((x) => x.s === ps) || rowsN.find((x) => x.n && x.n === pn);
    if (!best) {
      const cands = rowsN.filter((x) => x.n && pn && (pn.startsWith(x.n + ' ') || x.n.startsWith(pn + ' ')));
      best = cands.sort((a, b) => b.n.length - a.n.length)[0];
    }
    if (best) { p.latency = best.r.latency; used.add(best.r); matched++; }
  }
  return { matched, orphans: rows.filter((r) => !used.has(r)) };
}
