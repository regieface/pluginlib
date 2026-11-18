import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

function element() {
  const children = new Map();
  const listeners = new Map();
  return {
    dataset: {},
    classList: { add() {}, toggle() {} },
    setAttribute(name, value) { this[name] = value; },
    removeAttribute() {},
    remove() {},
    before() {},
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, target = this) { listeners.get(type)({ target }); },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element());
      return children.get(selector);
    },
    querySelectorAll() { return []; },
    append(...items) { (this.items ??= []).push(...items); },
    replaceChildren(...items) { this.items = items; },
    after() {}
  };
}

test('les sélections du comparateur survivent à la recherche, au filtrage et au changement de périmètre', async () => {
  const page = element();
  const find = selector => page.querySelector(selector);
  find('#tpl').content = { cloneNode: element };
  find('#scope').querySelectorAll = () => ['owned', 'all'].map(scope => {
    const button = element();
    button.dataset.scope = scope;
    return button;
  });

  const appUrl = new URL('../app.js', import.meta.url);
  const source = readFileSync(appUrl, 'utf8');
  // Use the real filter, card and event handlers. Supply the data in memory and
  // bypass boot-time file loading and mounting the filter widgets.
  const app = source.replaceAll('await import(', 'await loadModule(')
    .replace(/load\(\)\.catch\([^\n]+\);\s*$/, '');
  const run = runInNewContext(`async (loadModule, document, window, localStorage, ResizeObserver) => {
    ${app}
    return {
      start(plugins) {
        DATA = plugins;
        LBL = { categories: { comp: 'Compresseur' }, facets: {}, common: {} };
        status = { 'test--owned': 'owned' };
        render();
      },
      setFamily(value) {
        selections.family.include = [value];
        reconcileFamilyCriteria();
        rerender();
      }
    };
  }`, { clearTimeout() {}, setTimeout(callback) { callback(); } });
  const api = await run(
    path => import(new URL(path, appUrl)),
    { querySelector: find, querySelectorAll: () => [], createElement: element,
      createDocumentFragment: element, addEventListener() {} },
    {}, { getItem: () => null },
    class { observe() {} disconnect() {} }
  );
  const plugin = (id, name) => ({
    id, name, _s: name.toLowerCase(), vendor: 'Example', category: 'comp',
    tags: [], summary: '', presentation: {}
  });
  api.start([plugin('test--owned', 'Alpha'), plugin('test--other', 'Beta')]);

  const cardButton = () => find('#cards').items[0].items[0].querySelector('.compare-plugin');
  cardButton().fire('click');
  assert.match(find('#comparisonSelection').innerHTML, /test--owned/);

  find('#query').fire('input', { value: 'Beta' });
  assert.equal(find('#matched').textContent, '0');
  find('#searchScope').fire('click');
  assert.equal(find('#matched').textContent, '1');
  assert.equal(cardButton().dataset.pluginId, 'test--other');
  cardButton().fire('click');
  assert.equal(find('#openComparison').disabled, false);

  api.setFamily('eq');
  assert.equal(find('#matched').textContent, '0');
  find('#searchScope').fire('click');
  api.setFamily('comp');
  find('#query').fire('input', { value: '' });
  assert.equal(cardButton().dataset.pluginId, 'test--owned');
  assert.equal(cardButton()['aria-pressed'], 'true');
  assert.match(find('#comparisonSelection').innerHTML, /test--owned/);
  assert.match(find('#comparisonSelection').innerHTML, /test--other/);
});
