#!/usr/bin/env node
// PluginLib — collecte quotidienne des données.
// Lit sources/vendors.json, interroge les sites constructeurs, et écrit :
//   data/plugins.json  (le catalogue)
//   data/meta.json     (date, état de chaque source, libellés des filtres)
// Principe : on n'enregistre que ce qui a été lu sur le site du constructeur.
// Une page n'entre dans le catalogue que si elle a répondu HTTP 200 sans
// rediriger vers l'accueil. Si une source échoue, ses données de la veille
// sont conservées (et l'échec est signalé dans meta.json).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { classify, isOutOfScope, labels } from './classify.mjs';
import { parseWavesLatency, matchWaves } from './waves.mjs';
import { extractPage, parseSitemap, stripHtml, slug } from './parse.mjs';

const ROOT = new URL('..', import.meta.url);
const UA = 'PluginLibBot/1.0 (+https://github.com/AlineCoatanoan/pluginlib; catalogue personnel, 1 passage/jour)';
const MAX_PAGES = Number(process.env.MAX_PAGES || 500);
const ONLY = process.env.ONLY_VENDOR || '';
const LATENCY_URL = 'https://www.waves.com/support/tech-specs/plugin-latency';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { tries = 2, timeout = 25000, accept } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        headers: { 'user-agent': UA, 'accept-language': 'en,fr;q=0.8', ...(accept ? { accept } : {}) }
      });
      return { status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  return { status: 0, url, text: '', error: String(last?.message || last) };
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

const isHome = (u) => { try { const p = new URL(u).pathname; return p === '/' || /^\/[a-z]{2}(-[a-z]{2})?\/?$/i.test(p); } catch { return true; } };
const re = (list) => (list || []).map((s) => new RegExp(s, 'i'));

// ---------- Adaptateurs ----------

async function viaShopify(v) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${v.site}/products.json?limit=250&page=${page}`, { accept: 'application/json' });
    if (r.status !== 200) { if (page === 1) return null; break; }
    let j; try { j = JSON.parse(r.text); } catch { if (page === 1) return null; break; }
    if (!Array.isArray(j.products)) return page === 1 ? null : items;
    if (!j.products.length) break;
    for (const p of j.products) {
      items.push({
        name: p.title, url: `${new URL(r.url).origin}/products/${p.handle}`,
        image: p.images?.[0]?.src || null,
        text: [p.product_type, (p.tags || []).join(' '), stripHtml(p.body_html || '')].join('\n'),
        description: stripHtml(p.body_html || '').slice(0, 220), source: 'shopify'
      });
    }
  }
  return items;
}

async function viaWoo(v) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${v.site}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, { accept: 'application/json' });
    if (r.status !== 200) { if (page === 1) return null; break; }
    let j; try { j = JSON.parse(r.text); } catch { if (page === 1) return null; break; }
    if (!Array.isArray(j)) return page === 1 ? null : items;
    if (!j.length) break;
    for (const p of j) {
      const desc = stripHtml(p.short_description || p.description || '');
      items.push({
        name: stripHtml(p.name), url: p.permalink, image: p.images?.[0]?.src || null,
        text: [(p.categories || []).map((c) => c.name).join(' '), desc, stripHtml(p.description || '')].join('\n'),
        description: desc.slice(0, 220), source: 'woocommerce'
      });
    }
  }
  return items;
}

async function sitemapUrls(v) {
  const seeds = new Set([`${v.site}/sitemap.xml`, `${v.site}/sitemap_index.xml`]);
  const robots = await get(`${v.site}/robots.txt`);
  for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) seeds.add(m[1]);
  const queue = [...seeds], seen = new Set(), urls = new Set();
  while (queue.length && seen.size < 60) {
    const sm = queue.shift(); if (seen.has(sm)) continue; seen.add(sm);
    const r = await get(sm); if (r.status !== 200) continue;
    const { sitemaps, locs } = parseSitemap(r.text);
    // Sous-sitemaps : on privilégie ceux qui parlent de produits/plugins
    sitemaps.sort((a, b) => (/(product|plugin|plug-in)/i.test(b) ? 1 : 0) - (/(product|plugin|plug-in)/i.test(a) ? 1 : 0));
    queue.push(...sitemaps);
    locs.forEach((l) => urls.add(l.trim()));
  }
  return [...urls];
}

async function viaSitemap(v) {
  const inc = re(v.include), exc = re(v.exclude);
  let urls = await sitemapUrls(v);
  if (!urls.length) return null;
  urls = urls.filter((u) => (!inc.length || inc.some((r) => r.test(u))) && !exc.some((r) => r.test(u)));
  // Une seule langue : on écarte les doublons /fr/, /de/, etc. quand une version sans préfixe ou /en/ existe
  urls = urls.filter((u) => !/\/(de|fr|es|it|ja|jp|zh|cn|ko|pt|ru|nl)(-[a-z]{2})?\//i.test(new URL(u).pathname));
  urls = [...new Set(urls)].slice(0, MAX_PAGES);
  const pages = await pool(urls, 6, async (u) => {
    const r = await get(u);
    if (r.status !== 200 || isHome(r.url)) return null;
    const p = extractPage(r.text, r.url);
    if (!p.name) return null;
    if (!v.trustInclude && !p.isProduct) return null;
    return { name: p.name, url: p.canonical || r.url, image: p.image, text: [p.description, p.keywords, p.bodyText].join('\n'), description: (p.description || '').slice(0, 220), source: 'sitemap' };
  });
  return pages.filter(Boolean);
}

async function collectVendor(v) {
  const mode = v.mode || 'auto';
  if (mode === 'shopify') return { items: await viaShopify(v), via: 'shopify' };
  if (mode === 'woocommerce') return { items: await viaWoo(v), via: 'woocommerce' };
  if (mode === 'sitemap') return { items: await viaSitemap(v), via: 'sitemap' };
  for (const [fn, via] of [[viaShopify, 'shopify'], [viaWoo, 'woocommerce'], [viaSitemap, 'sitemap']]) {
    const items = await fn(v);
    if (items && items.length) return { items, via };
  }
  return { items: null, via: 'aucune' };
}

// ---------- Programme principal ----------

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(new URL(path, ROOT), 'utf8')); } catch { return fallback; }
}

async function main() {
  const { vendors } = await readJson('sources/vendors.json', { vendors: [] });
  const previous = await readJson('data/plugins.json', { plugins: [] });
  const overrides = await readJson('data/overrides.json', {});
  const prevMeta = await readJson('data/meta.json', { sources: [] });
  const now = new Date().toISOString();
  const status = [];
  let all = [];

  for (const v of vendors) {
    if (ONLY && v.name !== ONLY) continue;
    const t0 = Date.now();
    let res;
    try { res = await collectVendor(v); } catch (e) { res = { items: null, via: 'erreur', error: String(e) }; }
    const req = re(v.require);
    let items = res.items || [];
    const raw = items.length;
    items = items
      .filter((it) => it.name && it.url)
      .filter((it) => !req.length || req.some((r) => r.test(`${it.name} ${it.url}`)))
      .filter((it) => !isOutOfScope(`${it.name}\n${(it.text || '').slice(0, 600)}`));
    const ok = items.length > 0;
    if (!ok) {
      const kept = previous.plugins.filter((p) => p.vendor === v.name);
      all.push(...kept);
      status.push({ vendor: v.name, site: v.site, ok: false, via: res.via, found: raw, kept: kept.length, error: res.error || (raw ? 'tout filtré (hors périmètre)' : 'aucun produit lu'), ms: Date.now() - t0 });
    } else {
      for (const it of items) {
        const c = classify({ name: it.name, text: it.text || '' });
        all.push({
          id: `${slug(v.name)}--${slug(it.name)}`, name: it.name, vendor: v.name, url: it.url,
          image: it.image || null, description: it.description || '', category: c.category, tags: c.tags,
          classifiedBy: 'auto', source: it.source, checkedAt: now
        });
      }
      status.push({ vendor: v.name, site: v.site, ok: true, via: res.via, found: raw, kept: items.length, ms: Date.now() - t0 });
    }
    console.log(`${ok ? '✔' : '✘'} ${v.name.padEnd(22)} via ${res.via.padEnd(11)} lus=${raw} retenus=${ok ? items.length : 0}${res.error ? ' ' + res.error : ''}`);
  }

  // Latences officielles Waves
  let latencyStatus = { ok: false };
  if (!ONLY || ONLY === 'Waves') {
    const r = await get(LATENCY_URL);
    const rows = r.status === 200 ? parseWavesLatency(r.text) : [];
    if (rows.length) {
      const { matched, orphans } = matchWaves(all.filter((p) => p.vendor === 'Waves'), rows);
      for (const row of orphans) {
        const c = classify({ name: row.name, text: '' });
        all.push({ id: `waves--${slug(row.name)}`, name: row.name, vendor: 'Waves', url: null, image: null, description: '', category: c.category, tags: c.tags, classifiedBy: 'auto', source: 'waves-latency', checkedAt: now, latency: row.latency });
      }
      latencyStatus = { ok: true, rows: rows.length, matched, orphans: orphans.length, url: LATENCY_URL };
    } else {
      // garder les latences de la veille
      const prevLat = new Map(previous.plugins.filter((p) => p.latency).map((p) => [p.id, p.latency]));
      all.forEach((p) => { if (!p.latency && prevLat.has(p.id)) p.latency = prevLat.get(p.id); });
      latencyStatus = { ok: false, error: `HTTP ${r.status}`, url: LATENCY_URL };
    }
    console.log(`Latences Waves : ${JSON.stringify(latencyStatus)}`);
  }

  // Doublons (même id) : on garde l'entrée la plus complète
  const byId = new Map();
  for (const p of all) {
    const score = (x) => (x.url ? 2 : 0) + (x.image ? 1 : 0) + (x.latency ? 1 : 0);
    const cur = byId.get(p.id);
    if (!cur || score(p) > score(cur)) byId.set(p.id, cur && !p.latency && cur.latency ? { ...p, latency: cur.latency } : p);
  }
  // Corrections manuelles
  let plugins = [...byId.values()].map((p) => {
    const o = overrides[p.id];
    return o ? { ...p, ...o, classifiedBy: o.category || o.tags ? 'manuel' : p.classifiedBy } : p;
  }).filter((p) => !p.exclude);
  plugins.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));

  // Mode test sur un seul constructeur : on ne remplace pas tout le catalogue
  if (ONLY) {
    plugins = [...previous.plugins.filter((p) => p.vendor !== ONLY), ...plugins.filter((p) => p.vendor === ONLY)];
  }

  await mkdir(new URL('data/', ROOT), { recursive: true });
  await writeFile(new URL('data/plugins.json', ROOT), JSON.stringify({ generatedAt: now, count: plugins.length, plugins }, null, 1));
  const sources = ONLY ? [...prevMeta.sources.filter((s) => s.vendor !== ONLY), ...status] : status;
  await writeFile(new URL('data/meta.json', ROOT), JSON.stringify({ generatedAt: now, count: plugins.length, latency: latencyStatus, sources, labels: labels() }, null, 1));
  console.log(`\n${plugins.length} plugins écrits.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
