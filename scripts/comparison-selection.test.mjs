import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { normalizeClassification } from '../classification.mjs';

function element() {
  const children = new Map();
  const listeners = new Map();
  return {
    dataset: {},
    style: {},
    closest() { return this; },
    focus() {},
    classList: { add() {}, toggle() {} },
    setAttribute(name, value) { this[name] = value; },
    getAttribute(name) { return this[name]; },
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

test('les sélections du comparateur survivent à la recherche, au filtrage et au changement de périmètre', async t => {
  const page = element();
  const find = selector => page.querySelector(selector);
  find('#treatmentGrid').querySelectorAll = () => find('#treatmentGrid').items || [];
  find('#tpl').content = { cloneNode: element };
  find('#resultTpl').content = { cloneNode: element };
  find('#cards').querySelectorAll = selector => selector === '.compare-plugin'
    ? (find('#cards').items?.[0]?.items || []).map(row => row.querySelector(selector)).filter(button => button.dataset.pluginId)
    : [];
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
        DATA = plugins.map(normalizeClassification);
        LBL = { categories: { comp: 'Compresseur' }, facets: {}, common: {} };
        status = { 'test--owned': 'owned' };
        fillStatic();
        render();
      },
      setIndependentAndDependentFilters() {
        selections.maker.include = ['Example'];
        selections.attack.include = ['present'];
        selections.latency48.include = ['present'];
        st.sort = 'attack';
      },
      state() {
        return JSON.stringify({ ...st, selections });
      },
      familyButtons() {
        return filterChoices.get('treatmentFamily').root.items;
      }
    };
  }`, { normalizeClassification, clearTimeout() {}, setTimeout(callback) { callback(); } });
  const document = { querySelector: find, querySelectorAll: () => [], createElement: element,
    createDocumentFragment: element, addEventListener() {} };
  globalThis.document = document;
  t.after(() => delete globalThis.document);
  const persisted = new Map([['pluginlib.result-view.v1', 'grid']]);
  const api = await run(path => import(new URL(path, appUrl)), document,
    {}, { getItem: key => persisted.get(key), setItem: (key, value) => persisted.set(key, value) },
    class { observe() {} unobserve() {} }
  );
  const plugin = (id, name) => ({
    id, name, _s: name.toLowerCase(), vendor: 'Example', category: 'comp',
    categoryEvidence: { category: 'comp', status: 'documented', method: 'product-title', url: 'https://example.test/plugin' },
    tags: [], summary: '', presentation: {}
  });
  api.start([plugin('test--owned', 'Alpha'), plugin('test--other', 'Beta')]);

  assert.equal(find('#treatmentGrid').items.filter(button => button.dataset.treatment).length, 17);
  assert.notEqual(find('#treatmentGrid').hidden, true);
  assert.equal(find('#resetTreatment').disabled, true);
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

  assert.equal(find('#cards').dataset.view, 'grid');
  assert.equal(find('#viewGrid')['aria-pressed'], 'true');
  const displayed = find('#cards').items;
  const matchCount = find('#matched').textContent;
  for (const [buttonId, mode] of [['#viewList', 'list'], ['#viewGrid', 'grid']]) {
    find(buttonId).fire('click');
    assert.equal(find('#cards').dataset.view, mode);
    assert.equal(persisted.get('pluginlib.result-view.v1'), mode);
    assert.equal(find(buttonId)['aria-pressed'], 'true');
    assert.strictEqual(find('#cards').items, displayed);
    assert.equal(find('#matched').textContent, matchCount);
    assert.equal(cardButton()['aria-pressed'], 'true');
    assert.equal(find('#openComparison').disabled, false);
  }

  const state = () => JSON.parse(api.state());
  const treatmentButton = id => find('#treatmentGrid').items.find(button => button.dataset.treatment === id);
  const visibleFamilies = () => api.familyButtons().filter(button => !button.hidden);
  treatmentButton('equalizer').fire('click');
  assert.notEqual(find('#treatmentGrid').hidden, true);
  assert.equal(treatmentButton('equalizer')['aria-pressed'], 'true');
  assert.equal(treatmentButton('compressor')['aria-pressed'], 'false');
  assert.equal(visibleFamilies().length, 4);
  assert.ok(visibleFamilies().every(button => button['aria-label'].endsWith('Égaliseur')));
  assert.equal(find('#matched').textContent, '0');
  assert.equal(state().q, 'Beta');
  assert.equal(state().scope, 'all');

  treatmentButton('compressor').fire('click');
  assert.equal(visibleFamilies().length, 7);
  const opto = visibleFamilies().find(button => button['aria-label'] === 'Opto · Compresseur');
  opto.fire('click');
  assert.equal(opto['aria-pressed'], 'true');
  api.setIndependentAndDependentFilters();
  treatmentButton('equalizer').fire('click');
  assert.deepEqual(state().selections.treatmentFamily.include, []);
  assert.deepEqual(state().selections.attack.include, []);
  assert.deepEqual(state().selections.latency48.include, ['present']);
  assert.equal(state().sort, 'name');
  find('#resetTreatment').fire('click');
  assert.equal(find('#resetTreatment').disabled, true);
  assert.notEqual(find('#treatmentGrid').hidden, true);
  assert.ok(find('#treatmentGrid').items.every(button => button['aria-pressed'] === 'false'));
  assert.equal(visibleFamilies().length, 0);
  assert.deepEqual(state().selections.treatment.include, []);
  assert.deepEqual(state().selections.treatmentFamily.include, []);
  assert.deepEqual(state().selections.latency48.include, []);
  assert.deepEqual(state().selections.maker.include, ['Example']);
  assert.equal(state().q, 'Beta');
  assert.equal(state().scope, 'all');
  assert.equal(find('#matched').textContent, '1');
  assert.equal(find('#openComparison').disabled, false);
  find('#searchScope').fire('click');
  find('#query').fire('input', { value: '' });
  assert.equal(cardButton().dataset.pluginId, 'test--owned');
  assert.equal(cardButton()['aria-pressed'], 'true');
  assert.match(find('#comparisonSelection').innerHTML, /test--owned/);
  assert.match(find('#comparisonSelection').innerHTML, /test--other/);
});
