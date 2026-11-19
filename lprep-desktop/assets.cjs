const ORIGIN = 'lprep://app';
const START_URL = ORIGIN + '/lprep/';
const LIBRARY_URL = ORIGIN + '/index.html?embed=lprep';
const sharedModules = [
  'index.html', 'styles.css', 'app.js', 'pluginlib-worker.mjs', 'filters.mjs', 'multi-select.mjs',
  'record-types.mjs', 'collection-import.mjs', 'collection-storage.mjs', 'comparison.mjs', 'controller-status.mjs', 'controller-request.mjs',
  'catalog.mjs', 'catalog-data.mjs', 'classification.mjs', 'collection.mjs', 'descriptions.mjs',
  'latency-resolution.mjs', 'result-sorting.mjs', 'treatment-navigation.mjs', 'treatment-taxonomy.mjs'
];
const dataFiles = ['data/plugins.json', 'data/subscriptions.json', 'data/meta.json', 'data/descriptions-fr.json',
  'controller/profile-manifest.json', 'scripts/fixtures/lprep-project-v1.json'];
const contentTypes = {
  html: 'text/html; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png'
};
const files = new Set([...sharedModules, ...dataFiles]);
const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: http: data:", "connect-src 'self'", "worker-src 'self'", "frame-src 'self'",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
].join('; ');

function localAsset(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'lprep:' || url.host !== 'app' || url.username || url.password) return null;
  const file = url.pathname === '/lprep/' ? 'lprep/index.html' : url.pathname.slice(1);
  if (!files.has(file) && !/^lprep\/[a-z0-9-]+\.(?:html|mjs|css|png)$/.test(file)) return null;
  const headers = { 'Content-Type': contentTypes[file.split('.').at(-1)], 'X-Content-Type-Options': 'nosniff' };
  if (file.endsWith('.html')) headers['Content-Security-Policy'] = file === 'index.html'
    ? CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : CSP;
  if (file === 'lprep/thumbnail-worker.mjs' || file === 'pluginlib-worker.mjs') {
    headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; connect-src 'self' https: http:";
  }
  return { file, headers };
}

module.exports = { ORIGIN, START_URL, LIBRARY_URL, sharedModules, dataFiles, localAsset };
