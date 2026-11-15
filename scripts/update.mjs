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
import { parseWavesLatency, matchWaves, norm } from './waves.mjs';
import { extractPage, parseSitemap, stripHtml, slug } from './parse.mjs';

const ROOT = new URL('..', import.meta.url);
const UA = 'PluginLibBot/1.0 (+https://github.com/regieface/pluginlib; catalogue personnel, 1 passage/jour)';
const MAX_PAGES = Number(process.env.MAX_PAGES || 800);
const ONLY = process.env.ONLY_VENDOR || '';
const LATENCY_URL = 'https://www.waves.com/support/tech-specs/plugin-latency';

const LANG = /\/(de|fr|es|it|ja|jp|zh|cn|ko|pt|ru|nl|pl|tr|au|gb|eu|uk|ca)(-[a-z]{2})?\//i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let DIAG = null; // journal des requêtes du constructeur en cours (diagnostic)
async function get(url, { tries = 2, timeout = 25000, accept, log = false } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        headers: { 'user-agent': UA, 'accept-language': 'en,fr;q=0.8', ...(accept ? { accept } : {}) }
      });
      const out = { status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
      if (log && DIAG) DIAG.requests.push(`${res.status} ${url}${res.url !== url ? ' → ' + res.url : ''}`);
      return out;
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  if (log && DIAG) DIAG.requests.push(`ERR ${url} ${String(last?.message || last)}`);
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
    const r = await get(`${v.site}/products.json?limit=250&page=${page}`, { accept: 'application/json', log: page === 1 });
    if (r.status !== 200) { if (page === 1) return null; break; }
    let j; try { j = JSON.parse(r.text); } catch { if (page === 1) return null; break; }
    if (!Array.isArray(j.products)) return page === 1 ? null : items;
    if (page === 1 && DIAG) DIAG.productTypes = [...new Set(j.products.map((p) => p.product_type))].slice(0, 40);
    if (!j.products.length) break;
    for (const p of j.products) {
      items.push({
        name: p.title, url: `${new URL(r.url).origin}/products/${p.handle}`,
        image: p.images?.[0]?.src || null,
        text: [p.product_type, (p.tags || []).join(' '), stripHtml(p.body_html || '')].join('\n'),
        description: stripHtml(p.body_html || '').slice(0, 220), productType: p.product_type || '', source: 'shopify'
      });
    }
  }
  return items;
}

async function viaWoo(v) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${v.site}/wp-json/wc/store/v1/products?per_page=100&page=${page}`, { accept: 'application/json', log: page === 1 });
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
  const robots = await get(`${v.site}/robots.txt`, { log: true });
  for (const m of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) seeds.add(m[1]);
  const queue = [...seeds], seen = new Set(), urls = new Set();
  while (queue.length && seen.size < 120) {
    const sm = queue.shift(); if (seen.has(sm)) continue; seen.add(sm);
    try { if (LANG.test(new URL(sm).pathname)) continue; } catch { continue; }
    const r = await get(sm, { log: true }); if (r.status !== 200) continue;
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
  const keep = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') === new URL(v.site).hostname.replace(/^www\./, '') && (!inc.length || inc.some((r) => r.test(u))) && !exc.some((r) => r.test(u)) && !LANG.test(x.pathname); } catch { return false; } };
  const all = await sitemapUrls(v);
  if (DIAG) { const pref = {}; all.forEach((u) => { try { const k = new URL(u).pathname.split('/').slice(0, 3).join('/'); pref[k] = (pref[k] || 0) + 1; } catch { /* */ } }); DIAG.prefixes = Object.entries(pref).sort((a, b) => b[1] - a[1]).slice(0, 25); DIAG.sitemapUrls = all.length; DIAG.sample = all.filter((u) => /(product|plug)/i.test(u)).slice(0, 25); if (!DIAG.sample.length) DIAG.sample = all.slice(0, 25); }
  // Point de départ : sitemap filtré, ou à défaut les pages d'entrée déclarées (v.start)
  const starts = (v.start || []).map((x) => new URL(x, v.site).href.replace(/\/$/, ''));
  let queue = v.productsFrom === 'start' ? [...starts] : [...new Set(all.filter(keep)), ...starts];
  if (!queue.length) return all.length ? [] : null;
  const seen = new Set(), out = [];
  // Deux passes : les pages "liste" (catégories) servent à découvrir d'autres fiches produit
  for (let pass = 0; pass < 2 && queue.length; pass++) {
    const batch = queue.filter((u) => !seen.has(u)).slice(0, MAX_PAGES - seen.size);
    batch.forEach((u) => seen.add(u));
    queue = [];
    if (!batch.length) break;
    const pages = await pool(batch, 6, async (u) => {
      const r = await get(u);
      if (r.status !== 200 || isHome(r.url)) return null;
      const p = extractPage(r.text, r.url, v.name);
      const links = [...new Set([...r.text.matchAll(/href=["']([^"'#?]+)["']/gi)].map((m) => { try { return new URL(m[1], r.url).href.replace(/\/$/, ''); } catch { return null; } }).filter((x) => x && keep(x)))];
      return { u, r, p, links };
    });
    for (const x of pages.filter(Boolean)) {
      const own = x.u.replace(/\/$/, '');
      const others = x.links.filter((l) => l !== own);
      // Page "liste" : nom au pluriel générique ou beaucoup de liens vers d'autres fiches → pas un produit
      const isListing = (v.productsFrom === 'start' && pass === 0) || starts.includes(own) || !x.p.isProduct && (/(plug-?ins?|series|collection|bundles?)$|^(all|plug-?ins? for|top|best)\b/i.test(x.p.name || '') || others.length >= 30);
      if (pass === 0) queue.push(...others); // découverte : liens vers d'autres fiches
      if (isListing || (!v.trustInclude && !x.p.isProduct && v.productsFrom !== 'start') || !x.p.name) continue;
      out.push({ name: x.p.name, url: x.p.canonical || x.r.url, image: x.p.image, images: x.p.images, text: [x.p.description, x.p.keywords, x.p.bodyText].join('\n'), description: (x.p.description || '').slice(0, 220), source: 'sitemap' });
    }
    if (DIAG) DIAG[`pass${pass + 1}`] = { fetched: batch.length, products: out.length, discovered: queue.length };
  }
  return out;
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
  const diagnostics = [];
  let all = [];

  for (const v of vendors) {
    if (ONLY && v.name !== ONLY) continue;
    const t0 = Date.now();
    DIAG = { vendor: v.name, requests: [] };
    let res;
    try { res = await collectVendor(v); } catch (e) { res = { items: null, via: 'erreur', error: String(e) }; }
    const req = re(v.require);
    let items = res.items || [];
    const raw = items.length;
    items = items
      .filter((it) => it.name && it.url)
      .filter((it) => !req.length || req.some((r) => r.test(`${it.name} ${it.url}`)))
      .filter((it) => !(v.excludeNames || []).some((n) => new RegExp(n, 'i').test(it.name)))
      .filter((it) => !isOutOfScope(it.name, `${it.productType || ''} ${it.description || ''}`));
    // Un même visuel sur 3 fiches ou plus du fabricant = image générique : on prend l'image suivante propre à la page
    const imgCount = {}; items.forEach((it) => { if (it.image) imgCount[it.image] = (imgCount[it.image] || 0) + 1; });
    for (const it of items) {
      if (it.image && imgCount[it.image] >= 3) it.image = (it.images || []).find((u) => (imgCount[u] || 0) < 3) || null;
    }
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
    diagnostics.push(DIAG);
    console.log(`${ok ? '✔' : '✘'} ${v.name.padEnd(22)} via ${res.via.padEnd(11)} lus=${raw} retenus=${ok ? items.length : 0}${res.error ? ' ' + res.error : ''}`);
  }

  // Latences officielles Waves
  let latencyStatus = { ok: false };
  if (!ONLY || ONLY === 'Waves') {
    const r = await get(LATENCY_URL);
    const rows = r.status === 200 ? parseWavesLatency(r.text) : [];
    if (rows.length) {
      const { matched, orphans } = matchWaves(all.filter((p) => p.vendor === 'Waves'), rows);
      // Pour les lignes du tableau sans fiche trouvée : on teste l'adresse
      // waves.com/plugins/<nom>, et on ne la retient que si la page répond ET
      // affiche bien ce nom de produit (vérification, pas supposition).
      let verified = 0;
      const rescued = await pool(orphans.filter((o) => !isOutOfScope(o.name)), 4, async (row) => {
        const cand = `https://www.waves.com/plugins/${slug(row.name.replace(/[™®]/g, ''))}`;
        const r = await get(cand, { tries: 1 });
        let page = null;
        if (r.status === 200 && !isHome(r.url)) {
          const p = extractPage(r.text, r.url, 'Waves');
          if (p.name && norm(p.name) === norm(row.name)) { page = p; verified++; }
        }
        const text = page ? [page.description, page.bodyText].join('\n') : '';
        const c = classify({ name: row.name, text });
        return { id: `waves--${slug(row.name)}`, name: row.name, vendor: 'Waves', url: page ? (page.canonical || r.url) : null, image: page?.image || null, description: page ? (page.description || '').slice(0, 220) : '', category: c.category, tags: c.tags, classifiedBy: 'auto', source: page ? 'waves-latency+fiche' : 'waves-latency', checkedAt: now, latency: row.latency };
      });
      all.push(...rescued);
      latencyStatus = { ok: true, rows: rows.length, matched, orphans: orphans.length, orphansVerified: verified, url: LATENCY_URL };
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
  await writeFile(new URL('data/diagnostic.json', ROOT), JSON.stringify({ generatedAt: now, vendors: diagnostics }, null, 1));
  console.log(`\n${plugins.length} plugins écrits.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
