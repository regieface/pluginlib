import { basicSortOptions, rankResults } from '../result-sorting.mjs';
import { isCollectionStorageKey } from '../collection-storage.mjs';
import { CATALOG_STATUSES, PLATFORMS } from '../catalog.mjs';
import { cleanPublisherDescription } from '../descriptions.mjs';
import { dlGroupNumbers } from './lprep-constructor-services.mjs';
import { MACHINE_SAMPLE_RATES, machineSampleRates, projectMachines } from './lprep-audio-settings.mjs';
import { IndexedDBRevisionStore } from './lprep-browser-persistence.mjs';
import { catalogEntries, existingVariants, filterCatalog, importCatalogRights, instancePluginDetail, loadCatalog, sessionLatency, sessionRows } from './lprep-catalog-view.mjs';
import { bindBuilderDrag, bindContextMenu } from './lprep-builder-interactions.mjs';
import { createThumbnailView } from './lprep-thumbnails.mjs';
import { classifiedTreatments, factStateLabel, navigationFacets, sharedClassificationDetails, treatmentDetails, TREATMENT_OPTIONS } from '../treatment-navigation.mjs';
import { chainFormatKey, chainSidechainPorts } from './lprep-audio-graph.mjs';
import { graphPatchChannels } from './lprep-patch.mjs';
import { virtualPatchOptions } from './lprep-patch-edit.mjs';
import { patchChannelName as channelName, patchDisplayCells, patchRows } from './lprep-patch-view.mjs';
import { editableFormatPorts } from './lprep-chain-edits.mjs';
import { CHAIN_ROLES } from './lprep-project.mjs';
import { prepareDemoProject } from './lprep-demo.mjs';
import { createDefaultEnvironmentProfile, virtualResourceId } from './lprep-environment.mjs';
import { applySessionChainCount, createSessionDraft, planSessionChainCount, sessionDraftCapacity,
  sessionDraftNeeds, validateSessionDraft } from './lprep-session-draft.mjs';
import { LPrepUIController } from './lprep-ui-controller.mjs';

const controller = new LPrepUIController({ revisionStore: new IndexedDBRevisionStore() });
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const chainAudioFormat = chain => chainFormatKey(chain.inputFormat, chain.outputFormat);

const roleLabels = { insert: 'Insert', fx: 'FX', monitoring: 'Monitoring' };
const formatLabels = { mono: 'Mono', stereo: 'Stéréo', 'mono-to-stereo': 'Mono vers Stéréo',
  'stereo-to-mono': 'Stéréo vers Mono', multichannel: 'Multicanal', unknown: 'Inconnu' };
const chainPalette = [
  ['Corail', '#e25d3a'], ['Ocre', '#d8a23c'], ['Turquoise', '#35a8a3'], ['Indigo', '#6574d8'],
  ['Vert', '#66a357'], ['Bleu', '#3887c7'], ['Prune', '#9564b4'], ['Rose', '#cf668d']
];
const thumbnails = createThumbnailView(new URL('../', import.meta.url));
const revisionKey = 'lprep.last-opened-revision';
const orientationKey = 'lprep.builder-orientation';
const panelsKey = 'lprep.builder-panels';
let storage;
try { storage = window.localStorage; } catch { /* Le stockage peut être désactivé. */ }
let catalog, catalogError, catalogById = new Map();
let selectedChainId = null, patchFocus = null;
let libraryScope = 'owned', libraryLimit = 40;
const librarySort = $('#plugin-sort');
const librarySortKey = 'lprep.library-sort';
let librarySortPreference = 'name';
try { librarySortPreference = storage?.getItem(librarySortKey) || 'name'; } catch { /* Préférence de session. */ }


const orientationButton = $('#builder-orientation');
const editor = $('.editor');
let routingFrame;
function scheduleRoutingHeight() {
  cancelAnimationFrame(routingFrame);
  routingFrame = requestAnimationFrame(() => {
    if (editor.dataset.orientation !== 'vertical') return;
    const center = $('.center').getBoundingClientRect();
    const routing = $('.chain-scroll').getBoundingClientRect();
    editor.style.setProperty('--routing-line-top', `${Math.max(0, routing.top - center.top)}px`);
    let height = 34;
    for (const button of $$('.chain-patch')) {
      const bounds = button.getBoundingClientRect();
      if (!bounds.width) continue;
      const bottom = Math.max(...[...button.children].map(child => child.getBoundingClientRect().bottom));
      const style = getComputedStyle(button);
      height = Math.max(height, Math.ceil(bottom - bounds.top + button.scrollTop +
        parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth)));
    }
    editor.style.setProperty('--routing-line-height', `${Math.min(96, height)}px`);
  });
}
window.addEventListener('resize', scheduleRoutingHeight);
let savedPanels;
try { savedPanels = JSON.parse(storage?.getItem(panelsKey) || '{}'); }
catch { savedPanels = {}; }
const panelPreferences = {
  settings: { open: true, width: 135, min: 125, max: 420, direction: 1 },
  library: { open: true, width: 240, min: 180, max: 560, direction: -1 }
};
for (const [id, preferences] of Object.entries(panelPreferences)) {
  const saved = savedPanels?.[id];
  if (typeof saved?.open === 'boolean') preferences.open = saved.open;
  if (Number.isFinite(saved?.width) && (saved.explicitWidth || saved.width !== (id === 'settings' ? 180 : 320))) {
    preferences.explicitWidth = true;
    preferences.width = Math.min(preferences.max, Math.max(preferences.min, saved.width));
  }
}
function rememberPanels() {
  const values = Object.fromEntries(Object.entries(panelPreferences).map(([id, { open, width, explicitWidth }]) => [id, { open, width, explicitWidth }]));
  try { storage?.setItem(panelsKey, JSON.stringify(values)); }
  catch { /* Les panneaux restent utilisables dans l’onglet. */ }
}

function applyOrientation(value) {
  const orientation = value === 'vertical' ? 'vertical' : 'horizontal';
  const next = orientation === 'vertical' ? 'horizontale' : 'verticale';
  orientationButton.textContent = orientation === 'vertical' ? '▥' : '☰';
  orientationButton.title = `Passer en vue ${next}`;
  orientationButton.setAttribute('aria-label', orientationButton.title);
  editor.dataset.orientation = orientation;
  $('.chain-scroll').scrollTo(0, 0);
  if (orientation === 'vertical') scheduleRoutingHeight();
}
try { applyOrientation(storage?.getItem(orientationKey)); }
catch { applyOrientation('horizontal'); }
orientationButton.onclick = () => {
  const orientation = editor.dataset.orientation === 'vertical' ? 'horizontal' : 'vertical';
  applyOrientation(orientation);
  try { storage?.setItem(orientationKey, orientation); }
  catch { /* L’orientation reste active dans cet onglet. */ }
};

function rememberRevision(revisionId) {
  try {
    if (revisionId) storage?.setItem(revisionKey, revisionId);
    else storage?.removeItem(revisionKey);
  } catch { /* La liste IndexedDB reste accessible. */ }
}

function notify(message, error = false) {
  const node = $('#notice'); node.textContent = message; node.classList.add('show'); node.classList.toggle('error', error);
  clearTimeout(notify.timer); notify.timer = setTimeout(() => node.classList.remove('show'), 3500);
}

function resultNotice(result, success) {
  if (['committed', 'opened', 'saved', 'created', 'undone', 'redone'].includes(result?.status)) notify(success);
  else notify(result?.diagnostics?.[0]?.message || result?.diagnostics?.[0]?.code || 'Opération refusée.', true);
  render();
}

function renderSessions() {
  const select = $('#session-list');
  select.replaceChildren(...controller.project.sessions.map(session => new Option(session.name, session.sessionId)));
  select.value = controller.activeSessionId || '';
  const name = controller.activeSession?.name || 'Session';
  $('#header-session-name').textContent = name;
  $('#header-session-name').title = name;
  $('#duplicate-session').disabled = !controller.activeSession;
}

const contextMenu = bindContextMenu($('#builder-context-menu'));
const startDrag = bindBuilderDrag({
  list: $('#chain-list'),
  orientation: () => editor.dataset.orientation,
  revision: () => `${controller.activeSessionId}/${controller.service?.history.revisionId}`,
  moveChain(chainId, beforeId) {
    const order = controller.activeSession.chainOrder;
    if (beforeId === chainId || beforeId === (order[order.indexOf(chainId) + 1] ?? null)) return;
    resultNotice(controller.moveChain(chainId, beforeId), 'Chaîne déplacée.');
  },
  movePlugin(chainId, instanceId, beforeId, targetChainId) {
    if (chainId === targetChainId) {
      const order = controller.activeSession.chains.find(chain => chain.chainId === chainId).pluginOrder;
      if (beforeId === instanceId || beforeId === (order[order.indexOf(instanceId) + 1] ?? null)) return;
    }
    const result = controller.movePlugin(chainId, instanceId, beforeId, targetChainId);
    if (result.status === 'committed') selectedChainId = targetChainId;
    resultNotice(result, 'Plugin déplacé.');
  },
  insertPlugin: addLibraryPlugin
});

function editChainName(button, chain) {
  const label = button.parentElement;
  if (label.querySelector('input')) return;
  const field = document.createElement('input');
  field.type = 'text';
  field.className = 'chain-name-editor';
  field.setAttribute('aria-label', 'Nom de la chaîne');
  field.value = chain.name;
  button.inert = true;
  label.append(field);
  function finish(save) {
    const name = field.value.trim();
    field.onblur = null;
    field.remove();
    button.inert = false;
    if (save && name && name !== chain.name) {
      resultNotice(controller.renameChain(chain.chainId, name), 'Chaîne renommée.');
    } else if (button.isConnected) button.focus({ preventScroll: true });
  }
  field.onblur = () => finish(true);
  field.onkeydown = event => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    finish(event.key === 'Enter');
  };
  field.onclick = event => event.stopPropagation();
  field.focus();
  field.select();
}

function pluginTile(plugin, chain, independent = false) {
  const tile = document.createElement('figure');
  tile.className = independent ? 'plugin-tile independent' : 'plugin-tile';
  tile.title = [plugin.name, independent && 'Indépendant', plugin.unresolved && 'Variante à résoudre', plugin.bypassed && 'Bypass']
    .filter(Boolean).join(' · ');
  const label = document.createElement('figcaption');
  label.textContent = plugin.unresolved ? `${plugin.name} *` : plugin.name;
  if (plugin.unresolved) label.setAttribute('aria-label', `${plugin.name}, variante à résoudre`);
  const art = thumbnails.create(plugin);
  if (plugin.bypassed) {
    tile.classList.add('bypassed');
    const marker = document.createElement('span');
    marker.className = 'bypass-mark';
    marker.textContent = '⊘ Bypass';
    tile.append(marker);
  }
  tile.append(art, label);
  tile.tabIndex = 0;
  let dragged = false;
  const openDetails = () => {
    const instance = controller.activeSession?.pluginInstances.find(item => item.instanceId === plugin.id);
    if (!instance) return;
    const { plugin: details, instanceRows } = instancePluginDetail(instance, catalogById.get(instance.catalogRef?.pluginId));
    openPluginDetails(details, tile, instanceRows);
  };
  tile.addEventListener('pointerdown', () => { dragged = false; });
  art.addEventListener('dragstart', () => { dragged = true; });
  tile.onclick = event => {
    if (!dragged && !event.defaultPrevented && event.button === 0) openDetails();
  };
  tile.onkeydown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetails();
    }
  };
  contextMenu(tile, 'Supprimer le plugin', () =>
    resultNotice(controller.removePlugin(chain.chainId, plugin.id), 'Plugin retiré de la chaîne.'));
  if (!independent) {
    tile.dataset.pathPlugin = plugin.id;
    startDrag(art, { kind: 'plugin', chainId: chain.chainId, instanceId: plugin.id, label: plugin.name });
  }
  return tile;
}

function renderChainColors(root, chain) {
  const context = document.createElement('canvas').getContext('2d');
  if (context && chain.color && CSS.supports('color', chain.color)) context.fillStyle = chain.color;
  const current = chain.color ? context?.fillStyle : null;
  const custom = Boolean(chain.color && !chainPalette.some(([, color]) => color === current));
  root.innerHTML = `<legend>Couleur</legend><div class="chain-color-options">
    ${[['Sans couleur', null], ...chainPalette].map(([name, color]) => `
      <button type="button" class="chain-color-swatch" title="${name}" aria-label="${name}"
        aria-pressed="${color === current}" value="${color || ''}"
        ${color ? `style="--swatch:${color}"` : ''}>${color ? '' : '∕'}</button>`).join('')}
    <label class="chain-color-custom${custom ? ' current' : ''}" title="Couleur personnalisée">
      <span aria-hidden="true">＋</span>
      <input type="color" aria-label="Couleur personnalisée${custom ? ' (actuelle)' : ''}"
        value="${/^#[0-9a-f]{6}$/i.test(current || '') ? current : '#6574d8'}">
    </label></div>`;
  if (custom && CSS.supports('color', chain.color)) {
    root.querySelector('.chain-color-custom').style.setProperty('--swatch', chain.color);
  }
  function apply(color) {
    if (color === current) return;
    const result = controller.updateChainSettings(chain.chainId, { color });
    if (result.status !== 'committed') {
      resultNotice(result, 'Couleur mise à jour.');
      return;
    }
    const band = $('.chain-row.selected .chain-label button');
    if (color) band?.style.setProperty('--chain-color', color);
    else band?.style.removeProperty('--chain-color');
    if (color) band?.closest('.chain-row').style.setProperty('--chain-color', color);
    else band?.closest('.chain-row').style.removeProperty('--chain-color');
    renderChainColors(root, { ...chain, color });
    root.querySelector('[aria-pressed="true"], .current input')?.focus({ preventScroll: true });
  }
  for (const button of root.querySelectorAll('button')) button.onclick = () => apply(button.value || null);
  root.querySelector('input').onchange = event => apply(event.target.value);
}

function renderSelection() {
  const session = controller.activeSession;
  const chain = session?.chains.find(value => value.chainId === selectedChainId);
  const content = $('#settings-content');
  for (const row of $$('.chain-row')) {
    const selected = row.dataset.chain === chain?.chainId;
    row.classList.toggle('selected', selected);
    row.querySelector('.chain-label button').setAttribute('aria-pressed', String(selected));
  }
  if (!chain) {
    content.textContent = 'Sélectionnez une chaîne.';
    return;
  }
  const editFormat = Boolean(editableFormatPorts(session, chain));
  const options = (entries, selected) => entries.map(([value, text]) =>
    `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('');
  const mainFormats = [['mono', 'Mono'], ['stereo', 'Stéréo']];
  content.innerHTML = `<form class="chain-settings-form">
      <label>Nom<input name="name" value="${escapeHtml(chain.name)}" required></label>
      <label>Type<select name="role">${options(Object.entries(roleLabels), chain.role)}</select></label>
      <label>Format d’entrée<select name="inputFormat"${editFormat ? '' : ' disabled'}>${options(mainFormats, chain.inputFormat)}</select></label>
      <label>Format de sortie<select name="outputFormat"${editFormat ? '' : ' disabled'}>${options(mainFormats, chain.outputFormat)}</select></label>
      ${editFormat ? '' : '<small>Modifiable sur une chaîne vide et sans routing.</small>'}
      <label>Entrées Sidechain (SC)<input type="number" name="sidechainCount" min="0" max="32" step="1" required
        value="${chainSidechainPorts(session.audioGraph, chain).length}"></label>
      <fieldset class="chain-colors"></fieldset>
      <label>Groupe DL<input type="number" name="dlNumber" min="1" step="1" inputmode="numeric"
        placeholder="Sans DL" value="${dlGroupNumbers(session.compensationGroups).get(chain.compensationGroupId) ?? ''}"></label>
      <label class="settings-check"><input type="checkbox" name="allocationEligibility"${chain.allocationEligibility === false ? '' : ' checked'}> Inclure dans le Patch rapide</label>
      <button type="submit" class="primary">Appliquer</button>
    </form>
    <button type="button" id="save-preset">Créer un preset</button>`;
  const form = content.querySelector('form');
  renderChainColors(form.querySelector('.chain-colors'), chain);
  form.onsubmit = event => {
    event.preventDefault();
    const fields = form.elements;
    resultNotice(controller.updateChainSettings(chain.chainId, {
      name: fields.name.value, role: fields.role.value, sidechainCount: fields.sidechainCount.valueAsNumber,
      inputFormat: fields.inputFormat.value, outputFormat: fields.outputFormat.value,
      dlNumber: fields.dlNumber.value === '' ? null : fields.dlNumber.valueAsNumber,
      allocationEligibility: fields.allocationEligibility.checked
    }), 'Réglages de chaîne mis à jour.');
  };
  $('#save-preset').onclick = () => resultNotice(controller.saveActiveChainAsPreset(chain.chainId), 'Preset structurel créé.');
}

const patchNumber = number => String(number).padStart(2, '0');
const patchPortLabel = ({ position, side }) => `${patchNumber(position)}${side ? ` (${side})` : ''}`;
const sidechainName = label => `SC${patchNumber(label.slice(2))}`;
const channelLabel = (channels, direction) => channels?.length
  ? channels.map(channel => channelName(direction, channel)).join(', ') : channelName(direction, null);

const routeLabel = (direction, route) => route.peer || channelName(direction, route.number);
const scSourceLabel = port => port.sources.map(source => source.inputs.length
  ? channelLabel(source.inputs, 'input') : source.label || 'Source inconnue').join(' + ') || channelName('input', null);

function patchLanes(side, direction) {
  const groups = new Map();
  for (const cell of patchDisplayCells(side)) {
    const key = cell.ambiguous ? Symbol() : cell.position;
    if (!groups.has(key)) groups.set(key, { ...cell, routes: [] });
    if (cell.connectionIds.length) groups.get(key).routes.push(cell);
  }
  return [...groups.values()].map(cell => ({ ...cell,
    label: cell.routes.map(route => routeLabel(direction, route)).join(' + ') || channelName(direction, null)
  }));
}

function patchIndicator(chain, row) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'chain-patch';
  const sides = ['input', 'output'].map(direction => patchLanes(row[direction], direction).map(cell => ({
    port: patchPortLabel(cell), compactPort: patchNumber(cell.position), ambiguous: cell.ambiguous,
    resource: cell.label
  })));
  const labels = sides.map(channels => channels.map(({ port, resource, ambiguous }) => `${port} — ${escapeHtml(resource)}${ambiguous ? ' (position indicative)' : ''}`).join(', '));
  entry.innerHTML = `<span class="patch-indicator-sides">${sides.map((channels, index) =>
    `<span><b>${index ? 'OUT' : 'IN'}</b>${channels.map(({ port, compactPort, resource, ambiguous }) => `<span>
      <span class="routing-full">${port} — </span><span class="routing-compact">${compactPort} </span>${escapeHtml(resource)}${ambiguous ? '*' : ''}</span>`).join('')}
    ${!index ? row.sidechains.map(port =>
      `<span class="patch-indicator-sc">${sidechainName(port.label)}<span class="routing-full"> —</span> ${escapeHtml(scSourceLabel(port))}</span>`).join('') : ''}</span>`).join('')}</span>
    ${sides.some(channels => channels.some(cell => cell.ambiguous)) ? '<small>* Ordre indicatif</small>' : ''}`;
  entry.setAttribute('aria-controls', 'patch-view');
  const scLabels = row.sidechains.map(port => `${sidechainName(port.label)} — ${scSourceLabel(port)}`);
  entry.title = [`IN · ${labels[0]}`, `OUT · ${labels[1]}`, ...scLabels].join(' / ');
  entry.setAttribute('aria-label', `Patch de ${chain.name}. ${entry.title}`);
  entry.onclick = event => {
    event.stopPropagation();
    selectPatchChain(chain.chainId);
    showView('patch');
    const target = $('.patch-chain-row.focused') || $('#return-builder');
    const workspace = $('.patch-workspace');
    const frame = workspace.getBoundingClientRect(), bounds = target.getBoundingClientRect();
    if (bounds.top < frame.top || bounds.bottom > frame.bottom) {
      workspace.scrollTop += bounds.top - frame.top;
    }
    target.focus({ preventScroll: true });
  };
  return entry;
}

function renderChains() {
  const session = controller.activeSession;
  const rows = sessionRows(session, catalogById);
  const dlNumbers = dlGroupNumbers(session?.compensationGroups || []);
  const patch = new Map(patchRows(session).map(row => [row.chain.chainId, row]));
  const list = $('#chain-list');
  if (!rows.some(({ chain }) => chain.chainId === selectedChainId)) selectedChainId = null;
  thumbnails.clear(list);
  list.replaceChildren();
  $('#add-chain-menu').hidden = !controller.activeSession;
  for (const { chain, plugins, independent } of rows) {
    const row = document.createElement('article');
    row.className = 'chain-row';
    row.dataset.chain = chain.chainId;
    if (CSS.supports('color', chain.color)) row.style.setProperty('--chain-color', chain.color);
    const label = document.createElement('div');
    label.className = 'chain-label';
    const select = document.createElement('button');
    select.type = 'button';
    if (CSS.supports('color', chain.color)) select.style.setProperty('--chain-color', chain.color);
    const scCount = chainSidechainPorts(session.audioGraph, chain).length;
    select.innerHTML = `<strong>${escapeHtml(chain.name)}</strong>
      <small>${escapeHtml(formatLabels[chainAudioFormat(chain)])} · ${scCount} SC</small>
      <small>${escapeHtml(roleLabels[chain.role])}</small>`;
    select.title = `${chain.name} · Glisser pour déplacer · Double-clic pour renommer`;
    startDrag(select, { kind: 'chain', chainId: chain.chainId, label: chain.name });
    select.ondblclick = () => editChainName(select, chain);
    select.onkeydown = event => {
      if (event.key === 'F2') { event.preventDefault(); editChainName(select, chain); }
    };
    contextMenu(label, 'Supprimer la chaîne', () => {
      if (confirm(`Supprimer la chaîne « ${chain.name} » et ses plugins ?`)) {
        resultNotice(controller.removeChain(chain.chainId), 'Chaîne supprimée.');
      }
    });
    label.append(select);
    const dl = document.createElement('select');
    dl.className = 'chain-dl';
    dl.setAttribute('aria-label', `DL de ${chain.name}`);
    dl.append(new Option('Sans DL', ''), ...session.compensationGroups.map(group =>
      new Option(`DL${dlNumbers.get(group.compensationGroupId)}`, group.compensationGroupId)));
    dl.value = chain.compensationGroupId || '';
    row.dataset.dl = dl.value;
    dl.onclick = event => event.stopPropagation();
    dl.onchange = () => resultNotice(controller.updateChainSettings(chain.chainId, { compensationGroupId: dl.value || null }), 'DL mis à jour.');
    function highlight(active) {
      for (const item of $$('.chain-row')) {
        if (dl.value && item.dataset.dl === dl.value) item.classList.toggle('dl-highlight', active);
      }
    }
    dl.onpointerenter = () => highlight(true);
    dl.onpointerleave = () => highlight(false);
    dl.onfocus = () => highlight(true);
    dl.onblur = () => highlight(false);
    const dlBadge = document.createElement('div');
    dlBadge.className = 'chain-dl-badge';
    if (dl.value) {
      const index = dlNumbers.get(dl.value) - 1;
      dlBadge.style.setProperty('--dl-color', chainPalette[index % chainPalette.length][1]);
    }
    dlBadge.append(dl);
    label.append(dlBadge);
    if (list.childElementCount === 0) label.append(bandResize);
    const strip = document.createElement('div');
    strip.className = 'plugin-strip';
    strip.append(...plugins.map(plugin => pluginTile(plugin, chain)), ...independent.map(plugin => pluginTile(plugin, chain, true)));
    if (!strip.childElementCount) strip.textContent = 'Aucun plugin';
    const heading = document.createElement('div');
    heading.className = 'chain-heading';
    heading.append(patchIndicator(chain, patch.get(chain.chainId)), label);
    row.append(heading, strip);
    row.onclick = () => {
      if (selectedChainId === chain.chainId) return;
      selectedChainId = chain.chainId;
      renderSelection();
    };
    list.append(row);
  }
  scheduleRoutingHeight();
  if (!rows.length) list.textContent = controller.activeSession ? 'Aucune chaîne' : 'Aucune session';
  const presets = controller.presets.list();
  const presetList = $('#preset-list');
  presetList.replaceChildren(new Option('Insérer un preset…', ''),
    ...presets.map((preset, index) => new Option(preset.name, index)));
  presetList.hidden = !presets.length || !controller.activeSession;
  presetList.onchange = () => {
    const preset = presets[presetList.value];
    if (preset) resultNotice(controller.insertPreset(preset.presetId, preset.revision), 'Preset inséré.');
  };
  renderSelection();
}

function addLibraryPlugin(plugin, chainId = selectedChainId, beforeId = null) {
  if (!chainId) {
    notify('Sélectionnez une chaîne avant d’ajouter un plugin.', true);
    return;
  }
  const variants = existingVariants(controller.project, plugin.id);
  if (variants.length) {
    const dialog = $('#plugin-variant-dialog');
    if (dialog.open) return;
    const form = dialog.querySelector('form');
    const revision = controller.service.history.revisionId;
    const activeSessionId = controller.activeSessionId;
    const service = controller.service;
    $('#plugin-variant-title').textContent = plugin.name;
    form.elements.variant.replaceChildren(new Option('Variante à résoudre', ''),
      ...variants.map((ref, index) => new Option(`${ref.fallback.name} · ${ref.variantId} · rév. ${ref.revision}`, String(index))));
    form.onsubmit = event => {
      event.preventDefault();
      dialog.close();
      if (service !== controller.service || revision !== service.history.revisionId || activeSessionId !== controller.activeSessionId) {
        notify('Le projet a changé. Recommencez l’ajout.', true);
        return;
      }
      insertLibraryPlugin(plugin, chainId, beforeId, variants[form.elements.variant.value] || null);
    };
    $('#cancel-plugin-variant').onclick = () => dialog.close();
    dialog.showModal();
    return;
  }
  insertLibraryPlugin(plugin, chainId, beforeId, null);
}

function insertLibraryPlugin(plugin, chainId, beforeId, variantRef) {
  try {
    const result = controller.insertCatalogPlugin(chainId, plugin, beforeId, variantRef);
    if (result.status === 'committed') selectedChainId = chainId;
    resultNotice(result, variantRef ? `${plugin.name} ajouté.` : `${plugin.name} ajouté · variante à résoudre.`);
  } catch (error) { notify(error.message, true); }
}

const treatmentFilter = $('#plugin-treatment');
const familyFilter = $('#plugin-family');
const familyOptions = navigationFacets([]).treatmentFamily.options;
treatmentFilter.append(...TREATMENT_OPTIONS.map(([value, label]) => new Option(label, value)));

function refreshFamilies() {
  const treatment = treatmentFilter.value;
  const options = familyOptions.filter(([value]) => !treatment || value.startsWith(`${treatment}/`));
  familyFilter.replaceChildren(new Option('Toutes les familles', ''),
    ...options.map(([value, label]) => new Option(treatment ? label.split(' · ')[0] : label, value)));
  familyFilter.disabled = options.length === 0;
}
refreshFamilies();

const pluginDetailsDialog = $('#plugin-details');

function setPluginDetailZoom(button, expanded) {
  pluginDetailsDialog.classList.toggle('image-expanded', expanded);
  button.setAttribute('aria-pressed', String(expanded));
  button.title = expanded ? 'Réduire l’image' : 'Agrandir l’image';
  button.setAttribute('aria-label', button.title);
  pluginDetailsDialog.scrollTop = 0;
}

pluginDetailsDialog.addEventListener('cancel', event => {
  if (!pluginDetailsDialog.classList.contains('image-expanded')) return;
  event.preventDefault();
  setPluginDetailZoom(pluginDetailsDialog.querySelector('.plugin-detail-zoom'), false);
});

$('#plugin-details').addEventListener('click', event => {
  if (event.target !== event.currentTarget) return;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
    event.currentTarget.close();
  }
});

function openPluginDetails(plugin, trigger, instanceRows = []) {
  const dialog = pluginDetailsDialog;
  if (dialog.open) return;
  dialog.classList.remove('image-expanded');
  const body = $('#plugin-details-content');
  thumbnails.clear(body);
  $('#plugin-details-title').textContent = plugin.name;
  const { label, detail } = sessionLatency(plugin, controller.activeSession?.audioGraph.sampleRate);
  const facts = [...classifiedTreatments(plugin).flatMap(treatment =>
    [TREATMENT_OPTIONS.find(([id]) => id === treatment.type)?.[1] || treatment.type,
      ...treatmentDetails(plugin, treatment).map(({ label, value, fact }) => `${label} · ${value || factStateLabel(fact)}`)]),
    ...sharedClassificationDetails(plugin).map(({ label, value, fact }) => `${label} · ${value || factStateLabel(fact)}`)];
  const rows = [['Fabricant', plugin.vendor], ['Catégorie', plugin.category], ['Sous-type', plugin.subcategory],
    ['Latence de la session', [label, detail].filter(Boolean).join(' · ')],
    ...[48, 96].map(rate => [`Latence à ${rate} kHz`, sessionLatency(plugin, rate * 1000).label]), ['Plateformes', plugin.platforms?.map(id => PLATFORMS[id]).filter(Boolean).join(', ')],
    ['Statut', CATALOG_STATUSES[plugin.catalogStatus]], ['Caractéristiques', facts.join(' · ')], ...instanceRows];
  body.innerHTML = `<dl>${rows.filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) =>
    `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`;
  const zoom = document.createElement('button');
  zoom.type = 'button';
  zoom.className = 'plugin-detail-zoom';
  zoom.disabled = true;
  const art = thumbnails.create(plugin, { onReady: () => { zoom.disabled = false; } });
  if (art.dataset.thumbnail) {
    setPluginDetailZoom(zoom, false);
    zoom.onclick = () => setPluginDetailZoom(zoom, !dialog.classList.contains('image-expanded'));
    zoom.append(art);
    body.prepend(zoom);
  } else body.prepend(art);
  const summary = plugin.presentation?.kind === 'summary' ? plugin.presentation.text : plugin.description;
  if (typeof summary === 'string' && summary.trim()) {
    const description = document.createElement('p');
    description.textContent = cleanPublisherDescription(summary);
    body.append(description);
  }
  if (/^https?:\/\//i.test(plugin.url || '')) {
    const link = document.createElement('a');
    link.href = plugin.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Fiche constructeur ↗';
    body.append(link);
  }
  dialog.onclose = () => trigger.focus();
  dialog.showModal();
}

function renderLibrary({ resetScroll = false } = {}) {
  if ($('#plugin-library').hidden) return;
  const results = $('#library-results');
  const previousScroll = resetScroll ? 0 : results.scrollTop;
  thumbnails.clear(results);
  results.replaceChildren();
  if (!catalog) {
    results.textContent = catalogError || 'Chargement du catalogue…';
    return;
  }
  const entries = filterCatalog(catalogEntries(catalog, storage, libraryScope), {
    query: $('#plugin-search').value, treatment: treatmentFilter.value, family: familyFilter.value
  });
  if (!entries.length) results.textContent = 'Aucun plugin dans ce périmètre avec les filtres actuels.';
  const rate = controller.activeSession?.audioGraph.sampleRate;
  const rateKHz = Number.isFinite(rate) && rate > 0 ? rate / 1000 : null;
  const sortOptions = basicSortOptions(entries, rateKHz);
  if (!sortOptions.some(([key]) => key === librarySortPreference)) librarySortPreference = 'name';
  librarySort.replaceChildren(...sortOptions.map(([key, label]) => new Option(label, key)));
  librarySort.value = librarySortPreference;
  const ranked = rankResults(entries, librarySortPreference, 1, null, undefined, rateKHz);
  for (const { plugin } of ranked.slice(0, libraryLimit)) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'catalog-entry';
    row.dataset.pluginId = plugin.id;
    const identity = document.createElement('span');
    identity.className = 'catalog-identity';
    const name = document.createElement('strong');
    name.textContent = plugin.name;
    const vendor = document.createElement('small');
    vendor.textContent = plugin.vendor;
    const latency = document.createElement('small');
    const { label, detail } = sessionLatency(plugin, rate);
    latency.className = 'catalog-latency';
    latency.textContent = label;
    latency.title = detail;
    identity.append(name, vendor, latency);
    row.title = [plugin.name, plugin.vendor, label, detail, 'Double-clic pour ajouter'].filter(Boolean).join(' · ');
    const art = thumbnails.create(plugin);
    art.title = 'Consulter la fiche technique';
    row.append(art, identity);
    startDrag(row, { kind: 'catalog', plugin, label: plugin.name });
    let pendingDetails;
    art.onclick = () => {
      clearTimeout(pendingDetails);
      pendingDetails = setTimeout(() => {
        if (row.isConnected) openPluginDetails(plugin, row);
      }, 280);
    };
    row.addEventListener('dragstart', () => clearTimeout(pendingDetails));
    row.ondblclick = () => {
      clearTimeout(pendingDetails);
      addLibraryPlugin(plugin);
    };
    row.onkeydown = event => {
      if (event.repeat || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      if (event.key === ' ' || event.shiftKey) openPluginDetails(plugin, row);
      else addLibraryPlugin(plugin);
    };
    results.append(row);
  }
  if (entries.length > libraryLimit) {
    const more = document.createElement('button');
    more.textContent = 'Afficher la suite';
    more.onclick = () => { libraryLimit += 40; renderLibrary(); };
    results.append(more);
  }
  results.scrollTop = previousScroll;
}

function bindResize(handle, { property, initial, min, max, direction = 1, onResizeEnd }) {
  let width = initial;
  function resize(value) {
    width = Math.min(max, Math.max(min, value));
    editor.style.setProperty(property, `${width}px`);
    handle.setAttribute('aria-valuenow', width);
  }
  handle.setAttribute('aria-valuemin', min);
  handle.setAttribute('aria-valuemax', max);
  resize(initial);
  handle.onpointerdown = event => {
    if (event.button !== 0) return;
    handle.setPointerCapture(event.pointerId);
    const start = event.clientX, original = width;
    handle.onpointermove = move => resize(original + direction * (move.clientX - start));
    handle.onlostpointercapture = () => {
      handle.onpointermove = null;
      if (width !== original) onResizeEnd?.(width);
    };
  };
  handle.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    resize(width + direction * (event.key === 'ArrowLeft' ? -10 : 10));
    onResizeEnd?.(width);
  };
  handle.onclick = event => event.stopPropagation();
}

const bandResize = document.createElement('div');
bandResize.className = 'resize-handle right-edge';
bandResize.tabIndex = 0;
bandResize.setAttribute('role', 'separator');
bandResize.setAttribute('aria-orientation', 'vertical');
bandResize.setAttribute('aria-label', 'Largeur des bandeaux');
bindResize(bandResize, { property: '--chain-label', initial: 100, min: 72, max: 250 });
for (const [id, preferences] of Object.entries(panelPreferences)) {
  const { width: initial, min, max, direction } = preferences;
  bindResize($(`[data-resize=${id}]`), { property: `--${id}-width`, initial, min, max, direction,
    onResizeEnd(width) {
      preferences.width = width;
      preferences.explicitWidth = true;
      rememberPanels();
    }
  });
}

function assignmentsByResource(session) {
  const result = new Map();
  for (const assignment of session?.patchAssignments || []) for (const ref of assignment.resourceRefs) result.set(ref, assignment);
  return result;
}

function patchSide(side, direction) {
  const { portId, connectionIds, externalLayout } = side;
  const cells = patchLanes(side, direction);
  return `<div class="patch-slots" data-port-id="${escapeHtml(portId)}" data-direction="${direction}" data-external-layout="${externalLayout}">
    ${cells.map(cell => `<button type="button" class="patch-slot" data-slot="${cell.position}"
      data-lane="${cell.lane ?? ''}" data-channel="${cell.number ?? ''}" data-ambiguous="${cell.ambiguous}"
      data-routes="${escapeHtml(JSON.stringify(cell.routes))}" data-local-lane="${cell.localLane ?? cell.lane ?? cell.position}">
      <strong>${patchPortLabel(cell)}</strong><span>${escapeHtml(cell.label)}</span>
    </button>`).join('')}
    ${cells.some(cell => cell.ambiguous) ? '<small>Positions indicatives · correspondance non documentée</small>' : ''}
    ${connectionIds.length > 1 ? `<small>${connectionIds.length} liaisons</small>` : ''}
  </div>`;
}

function patchSidechains(sidechains) {
  if (!sidechains.length) return '';
  return `<div class="patch-sidechains" data-direction="sidechain"><small>Sidechain</small>
    ${sidechains.map(({ portId, label, sources }) => `<button type="button" class="patch-slot" data-port-id="${escapeHtml(portId)}"
      data-local-lane="1" data-routes="${escapeHtml(JSON.stringify(sources.flatMap(source => (source.inputs.length
        ? source.inputs.map(number => ({ number }))
        : [...new Set(source.channelMap?.map(pair => pair.sourceChannel) || [null])]
          .map(peerLane => ({ number: null, peer: source.label, peerLane }))
      ).map(route => ({ ...route, connectionIds: [source.connectionId], ambiguous: !source.channelMap })))))}">
      <strong>${sidechainName(label)}</strong><span>${sources.length ? '← ' : ''}${escapeHtml(scSourceLabel({ sources }))}</span>
    </button>`).join('')}
  </div>`;
}

const patchPortLabels = { send: 'Départ', return: 'Retour', sidechain: 'Sidechain', auxiliary: 'Auxiliaire' };

function patchDetail({ connection, source, destination, internal, inputs, outputs }) {
  const session = controller.activeSession;
  const endpoint = ({ node, port }) => [session.chains.find(chain => port && [
    chain.mainPath.inputBoundaryPortRef, chain.mainPath.outputBoundaryPortRef
  ].includes(port.portId))?.name || node?.label || node?.nodeId, port?.label || patchPortLabels[port?.role]]
    .filter(Boolean).join(' · ');
  const roles = [patchPortLabels[source.port?.role], patchPortLabels[destination.port?.role]].filter(Boolean);
  if (internal) roles.unshift('Interne');
  if (connection.routingRole === 'sidechain') roles.unshift('Sidechain');
  else if (connection.routingRole === 'secondary') roles.push('Secondaire');
  else if (connection.routingRole === 'auxiliary') roles.push('Auxiliaire');
  if (roles.length === 0) roles.push(connection.routingRole === 'main' ? 'Principale' : 'Type non précisé');
  const virtual = [inputs.length && channelLabel(inputs, 'input'), outputs.length && channelLabel(outputs, 'output')].filter(Boolean);
  const status = connection.enabledState === 'disabled' ? ' · Désactivée' : '';
  return `<li data-connection-id="${escapeHtml(connection.connectionId)}">
    <strong>${[...new Set(roles)].join(' · ')}</strong>
    <span>${escapeHtml(endpoint(source))} → ${escapeHtml(endpoint(destination))}${virtual.length ? ` · ${virtual.join(' / ')}` : ''}${status}</span>
  </li>`;
}

const patchEditDialog = $('#patch-edit-dialog');
const patchEditForm = patchEditDialog.querySelector('form');
let patchEdit;
const resourceStates = { free: 'Libre', used: 'Utilisée', reserved: 'Réservée', locked: 'Verrouillée', unavailable: 'Indisponible' };

function openPatchEditor(chain, button) {
  const session = controller.activeSession;
  const holder = button.closest('[data-direction]');
  const direction = holder.dataset.direction;
  const portId = button.dataset.portId || holder.dataset.portId;
  const routes = JSON.parse(button.dataset.routes);
  const ambiguous = button.dataset.ambiguous === 'true';
  const options = patchEditForm.elements.choice;
  options.replaceChildren(new Option('Choisir une action…', ''));
  const choices = new Map();
  function add(group, label, choice, target = {}, disabled = false) {
    const value = String(choices.size + 1);
    const option = new Option(label, value);
    option.disabled = disabled;
    group.append(option);
    choices.set(value, { choice, target });
  }
  const virtualDirection = direction === 'output' ? 'output' : 'input';
  const removals = document.createElement('optgroup');
  removals.label = 'Connexions existantes';
  for (const route of routes) for (const id of route.connectionIds) {
    const edge = session.audioGraph.connections.find(item => item.connectionId === id);
    const locked = edge?.hostBindingRef || session.patchAssignments?.some(assignment =>
      assignment.assignmentId === edge?.originAssignmentId && (assignment.locked || assignment.purpose === 'music'));
    const label = routeLabel(virtualDirection, route) + (route.peerLane ? ` · canal ${route.peerLane}` : '');
    add(removals, `Retirer ${label}`, null, { connectionIds: [id], channel: route.number,
      lane: route.lane ?? null, peerLane: route.peerLane, externalLayout: holder.dataset.externalLayout === 'true' },
    Boolean(locked || route.ambiguous));
  }
  if (removals.children.length) options.append(removals);
  const resources = document.createElement('optgroup');
  resources.label = 'Ajouter une ressource virtuelle';
  for (const item of virtualPatchOptions(session, virtualDirection)) {
    const sources = virtualDirection === 'output' ? session.chains.filter(chain => item.edges.some(edge =>
      edge.sourcePortId === chain.mainPath.outputBoundaryPortRef)).map(chain => chain.name) : [];
    add(resources, `${channelName(virtualDirection, item.channelNumber)} · ${resourceStates[item.status]}${sources.length ? ` · ${sources.join(' + ')}` : ''}`,
      { kind: 'virtual', id: item.resourceId }, {}, !['free', 'used'].includes(item.status));
  }
  options.append(resources);
  const peers = document.createElement('optgroup');
  peers.label = direction === 'output' ? 'Ajouter une destination' : 'Ajouter une source';
  for (const source of session.chains) {
    if (source.chainId === chain.chainId) continue;
    const peerId = direction === 'output' ? source.mainPath.inputBoundaryPortRef : source.mainPath.outputBoundaryPortRef;
    const port = session.audioGraph.ports.find(value => value.portId === peerId);
    if (!port || port.mediaType !== 'audio' || !port.channelCount) continue;
    for (let lane = 1; lane <= port.channelCount; lane++) {
      const label = port.channelCount === 1 ? source.name : `${source.name} · ${port.channelCount === 2 ? (lane === 1 ? 'L' : 'R') : lane}`;
      add(peers, label, { kind: 'chain', id: source.chainId, lane });
    }
  }
  if (peers.children.length) options.append(peers);
  patchEdit = { chainId: chain.chainId, service: controller.service, sessionId: session.sessionId,
    revision: controller.service.history.revisionId, choices, target: {
      direction, portId, lane: Number(button.dataset.localLane) || 1, connectionIds: []
    } };
  const portLabel = button.querySelector('strong').textContent;
  $('#patch-edit-title').textContent = `${chain.name} · ${direction === 'sidechain' ? portLabel : `${virtualDirection === 'input' ? 'IN' : 'OUT'} ${portLabel}`}`;
  $('#patch-edit-note').textContent = ambiguous ? 'La correspondance technique de la liaison existante est inconnue. Son retrait individuel est protégé.' :
    'Les nouvelles connexions s’ajoutent aux connexions existantes.';
  patchEditDialog.showModal();
}
$('#cancel-patch-edit').onclick = () => patchEditDialog.close();
patchEditForm.onsubmit = event => {
  event.preventDefault();
  const { chainId, target, choices, service, sessionId, revision } = patchEdit;
  if (controller.service !== service || controller.activeSessionId !== sessionId || service.history.revisionId !== revision) {
    patchEditDialog.close();
    notify('Le projet a changé. Rouvrez le sélecteur.', true);
    return;
  }
  const action = choices.get(patchEditForm.elements.choice.value);
  if (!action || patchEditForm.elements.choice.selectedOptions[0]?.disabled) return;
  if (!action.choice && !confirm('Retirer cette liaison ?')) return;
  const result = controller.editPatch(chainId, { ...target, ...action.target, confirmed: true }, action.choice);
  if (result.status === 'committed') {
    patchEditDialog.close();
    resultNotice(result, 'Patch mis à jour.');
  } else $('#patch-edit-note').textContent = result.diagnostics?.[0]?.message || 'Affectation refusée.';
};

function selectPatchChain(chainId) {
  const changed = selectedChainId !== chainId;
  selectedChainId = chainId;
  patchFocus = { sessionId: controller.activeSessionId, chainId };
  if (changed) renderSelection();
}

const patchInfo = $('#patch-info');
$('#close-patch-info').onclick = () => patchInfo.close();
function showPatchInfo(chain, details, independent) {
  $('#patch-info-title').textContent = `Connexions de ${chain.name}`;
  $('#patch-info-content').innerHTML = `
    ${!details.length && !independent.length ? '<p>Aucune connexion avancée.</p>' : ''}
    ${details.length ? `<ul>${details.map(patchDetail).join('')}</ul>` : ''}
    ${independent.length ? `<div class="patch-independent"><strong>Plugins indépendants</strong>
      <ul>${independent.map(instance => `<li>${escapeHtml(instance.displayName || instance.catalogRef.fallback.name)}</li>`).join('')}</ul>
    </div>` : ''}`;
  patchInfo.showModal();
}

function renderPatchTable(session, focus) {
  const table = $('.patch-table');
  for (const body of [...table.tBodies]) body.remove();
  const rows = patchRows(session);
  if (!rows.length) {
    table.insertAdjacentHTML('beforeend', '<tbody><tr><td colspan="3">Aucune chaîne dans cette session.</td></tr></tbody>');
    return;
  }
  for (const { chain, input, output, sidechains, details, independent } of rows) {
    const body = table.createTBody();
    body.dataset.chainId = chain.chainId;
    if (CSS.supports('color', chain.color)) body.style.setProperty('--patch-chain-color', chain.color);
    const selected = focus?.chainId === chain.chainId;
    body.innerHTML = `<tr tabindex="-1" class="patch-chain-row${selected ? ' focused' : ''}">
      <td>${patchSide(input, 'input')}${patchSidechains(sidechains)}</td>
      <th scope="row" class="patch-chain-info">
        <button type="button" class="patch-chain-select" aria-pressed="${selected}">${escapeHtml(chain.name)}</button>
        <small>${escapeHtml(roleLabels[chain.role])} · ${escapeHtml(formatLabels[chainAudioFormat(chain)])}</small>
        <button type="button" class="patch-info-button" aria-label="Informations techniques de ${escapeHtml(chain.name)}" title="Informations techniques">ⓘ</button>
      </th>
      <td>${patchSide(output, 'output')}</td>
    </tr>`;
    for (const button of body.querySelectorAll('.patch-slot')) button.onclick = () => openPatchEditor(chain, button);
    body.querySelector('.patch-info-button').onclick = event => {
      event.stopPropagation();
      showPatchInfo(chain, details, independent);
    };
    // Run before the slot or info button opens its dialog without replacing the event target.
    body.querySelector('.patch-chain-row').addEventListener('click', () => {
      if (patchFocus?.sessionId === session.sessionId && patchFocus.chainId === chain.chainId &&
        selectedChainId === chain.chainId) return;
      selectPatchChain(chain.chainId);
      renderPatch({ preserveRows: true });
    }, { capture: true });
  }
}

function renderPatch({ preserveRows = false } = {}) {
  const session = controller.activeSession, assignments = assignmentsByResource(session);
  const reserved = new Set((session?.environmentConfiguration?.reservations || []).flatMap(value => value.resourceRefs));
  const focus = patchFocus?.sessionId === session?.sessionId &&
    session?.chains.find(chain => chain.chainId === patchFocus.chainId);
  const byChain = session ? graphPatchChannels(session) : new Map();
  const graphChannels = focus && byChain.get(focus.chainId);
  if (preserveRows) {
    for (const row of $$('.patch-chain-row')) {
      const selected = row.parentElement.dataset.chainId === focus?.chainId;
      row.classList.toggle('focused', selected);
      row.querySelector('.patch-chain-select').setAttribute('aria-pressed', String(selected));
    }
  } else renderPatchTable(session, focus);
  for (const direction of ['input', 'output']) {
    const root = $(`#${direction}-grid`);
    const active = new Set(graphChannels?.[direction] || []);
    const channelOwners = new Map();
    for (const chain of session?.chains || []) {
      for (const channel of byChain.get(chain.chainId)?.[direction] || []) {
        if (!channelOwners.has(channel)) channelOwners.set(channel, []);
        channelOwners.get(channel).push(chain.name);
      }
    }
    const numbers = [...new Set([...Array.from({ length: 32 }, (_, index) => index + 1), ...channelOwners.keys()])].sort((a, b) => a - b);
    root.innerHTML = numbers.map(channel => {
      const ref = session && virtualResourceId(session.sessionId, `virtual-${direction}`, channel);
      const assignment = assignments.get(ref);
      const online = channelOwners.get(channel);
      const name = reserved.has(ref) ? 'Musique' : online?.join(', ');
      return `<div class="channel ${online ? 'assigned' : ''} ${active.has(channel) ? 'patch-channel-focus' : ''} ${reserved.has(ref) ? 'reserved' : ''} ${assignment?.locked ? 'locked' : ''}"><strong>${channelName(direction, channel)}</strong><br>${escapeHtml(name || 'Libre')}</div>`;
    }).join('');
  }
  const proposal = controller.patchProposal, root = $('#patch-proposal');
  if (!proposal) root.innerHTML = '';
  else if (!proposal.valid) root.innerHTML = `<div class="proposal error"><strong>Proposition impossible</strong><div>${proposal.issues.map(value => escapeHtml(value.message)).join('<br>')}</div><div class="proposal-actions"><button id="cancel-proposal">Fermer</button></div></div>`;
  else root.innerHTML = `<div class="proposal"><strong>${proposal.status === 'partial' ? 'Proposition partielle' : 'Proposition prête'}</strong><div>${proposal.diff.addedAssignmentRefs.length} affectations et ${proposal.diff.addedConnectionRefs.length} connexions à créer.</div>${proposal.missingAssignments.length ? `<div>${proposal.issues.filter(value => value.code === 'patch.capacity').map(value => escapeHtml(value.message)).join('<br>')}</div>` : ''}<div class="proposal-actions"><button id="apply-proposal" class="primary">Confirmer l’application</button><button id="cancel-proposal">Annuler</button></div></div>`;
  $('#apply-proposal')?.addEventListener('click', () => resultNotice(controller.applyPatch(), 'Patch appliqué atomiquement.'));
  $('#cancel-proposal')?.addEventListener('click', () => { controller.cancelPatch(); renderPatch(); });
}

function renderDiagnostics() {
  const diagnostics = controller.diagnostics(); $('#diagnostic-count').textContent = diagnostics.length;
  $('#diagnostic-list').innerHTML = diagnostics.length ? diagnostics.map(value => `<article class="diagnostic ${value.severity === 'error' ? 'error' : ''}"><strong>${escapeHtml(value.code)}</strong><div>${escapeHtml(value.message)}</div><small>${escapeHtml(value.path)}</small></article>`).join('') : '<div class="empty">Aucun diagnostic structurel.</div>';
}

async function renderSaved() {
  try {
    const records = await controller.listSavedProjects();
    $('#saved-projects').innerHTML = records.length ? records.map(value => {
      let name = value.projectId;
      try { name = JSON.parse(value.documentSnapshotRef.document).name || name; }
      catch { /* Une révision endommagée reste identifiable. */ }
      return `<button data-revision="${escapeHtml(value.revisionId)}">${escapeHtml(name)}<br><small>${new Date(value.committedAt).toLocaleString('fr-FR')}</small></button>`;
    }).join('') : '<span class="tag">Aucun</span>';
    $$('#saved-projects [data-revision]').forEach(button => button.onclick = async () => {
      try {
        await controller.openRevision(button.dataset.revision);
        rememberRevision(button.dataset.revision);
        selectedChainId = null;
        $('.project-menu').open = false;
        notify('Projet rechargé.');
        render();
      } catch (error) { notify(error.message, true); }
    });
  } catch (error) { $('#saved-projects').innerHTML = `<span>${escapeHtml(error.message)}</span>`; }
}

function render() {
  const project = controller.project, session = controller.activeSession;
  $('#project-name').textContent = project?.name || 'Projet';
  $('#project-name').title = project?.name || 'Projet';
  $('#session-name').textContent = session?.name || '—';
  const machine = session?.targetMachineRef?.fallback?.name || 'Machine non définie';
  $('#target-machine').textContent = machine;
  $('#target-machine').title = `Choisir la machine cible · ${machine}`;
  $('#sample-rate').textContent = session?.audioGraph.sampleRate ? `${(session.audioGraph.sampleRate / 1000).toLocaleString('fr-FR')} kHz` : '— kHz';
  $('#sample-rate').title = 'Choisir la fréquence audio de la session';
  $('#target-machine').disabled = !session;
  $('#sample-rate').disabled = !session;
  const patched = session ? [...graphPatchChannels(session).values()].filter(value => value.input.length || value.output.length).length : 0;
  $('#routing-status').textContent = `Patch ${patched}/${session?.chains.length || 0}`;
  $('#routing-status').title = 'Chaînes avec au moins une liaison virtuelle';
  renderSaveStatus();
  $('#session-meta').textContent = session ? `${session.targetMachineRef?.fallback?.name || 'Machine non définie'} · ${session.environmentSourceRef?.fallback?.name || 'Environnement non défini'}` : '—';
  const creation = controller.lastSessionCreation;
  const warning = $('#session-creation-warning');
  const allocation = creation?.sessionId === session?.sessionId ? creation.allocation : null;
  const incompletePatch = allocation && ['partial', 'impossible'].includes(allocation.status);
  warning.hidden = !incompletePatch;
  warning.textContent = incompletePatch ? (allocation.status === 'partial' ?
    `Patch automatique partiel : ${allocation.missingAssignments.length} affectation(s) restent à compléter dans Patch rapide.` :
    `Aucune affectation automatique possible : complétez le routing dans Patch rapide.`) : '';
  renderSessions(); renderChains(); renderLibrary(); renderPatch(); renderDiagnostics(); renderSaved();
}

function download(name, content) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }

const headerMenus = $$('.topbar .project-menu');
document.addEventListener('click', event => {
  for (const menu of headerMenus) if (!menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const menu = headerMenus.find(item => item.open);
  if (!menu) return;
  menu.open = false;
  menu.querySelector('summary').focus();
});

const createDocumentDialog = $('#create-document-dialog');
const createDocumentForm = createDocumentDialog.querySelector('form');
const createDocumentError = $('#create-document-error');
let creatingProject;
function requestDocumentName(project) {
  creatingProject = project;
  createDocumentForm.reset();
  const { name, replace } = createDocumentForm.elements;
  const mustConfirm = project && controller.hasUnsavedChanges;
  $('#replace-unsaved-project').hidden = !mustConfirm;
  replace.required = mustConfirm;
  name.value = project ? 'Nouveau projet' : 'Nouvelle session';
  $('#create-document-title').textContent = name.value;
  createDocumentError.hidden = true;
  for (const menu of headerMenus) menu.open = false;
  createDocumentDialog.showModal();
  name.select();
}
$('#new-project').onclick = () => requestDocumentName(true);
$('#cancel-create-document').onclick = () => createDocumentDialog.close();
createDocumentForm.onsubmit = event => {
  event.preventDefault();
  const name = createDocumentForm.elements.name.value.trim();
  try {
    if (!name) throw new Error('Saisissez un nom.');
    if (creatingProject) {
      controller.createProject(name);
      patchFocus = null;
      showView('builder');
    } else {
      const result = controller.createSession(name);
      if (result.status !== 'committed') throw new Error(result.diagnostics?.[0]?.message || 'Création de la session impossible.');
    }
    selectedChainId = null;
    createDocumentDialog.close();
    notify(creatingProject ? 'Projet créé.' : 'Session créée et ouverte.');
    render();
  } catch (error) {
    createDocumentError.textContent = error.message;
    createDocumentError.hidden = false;
  }
};

const createSessionDialog = $('#create-session-dialog');
const createSessionForm = $('#create-session-form');
const sessionDraftRows = $('#session-draft-rows');
const sessionEnvironmentProfiles = [createDefaultEnvironmentProfile()];
let sessionDraft;

function sessionDraftContext() {
  return { machines: projectMachines(controller.project), profiles: sessionEnvironmentProfiles,
    presets: controller.presets.list() };
}

function selectedSessionProfile() {
  return sessionEnvironmentProfiles.find(profile => profile.environmentProfileId === sessionDraft.environmentProfileId) || null;
}

function updateSessionDraftStatus() {
  const context = sessionDraftContext();
  const issues = validateSessionDraft(sessionDraft, context);
  const profile = selectedSessionProfile();
  const capacity = sessionDraftCapacity(profile), needs = sessionDraftNeeds(sessionDraft);
  const exceeded = needs.inputs > capacity.inputs || needs.outputs > capacity.outputs;
  const summary = $('#session-resource-summary');
  summary.textContent = `Entrées : ${needs.inputs}/${capacity.inputs} · Sorties : ${needs.outputs}/${capacity.outputs}` +
    (exceeded ? ' — capacité dépassée, la création restera autorisée dans S2.' : '');
  summary.classList.toggle('warning', exceeded);
  const general = issues.filter(issue => !issue.path.startsWith('chains.'));
  $('#session-draft-general-errors').textContent = general.map(issue => issue.message).join(' ');
  for (const row of sessionDraftRows.rows) {
    const prefix = `chains.${row.dataset.draftChainId}.`;
    const rowIssues = issues.filter(issue => issue.path.startsWith(prefix));
    row.querySelector('.row-error').textContent = rowIssues.map(issue => issue.message).join(' ');
    for (const field of row.querySelectorAll('[name]')) {
      field.classList.toggle('invalid', rowIssues.some(issue => issue.path === `${prefix}${field.name}`));
    }
  }
  createSessionForm.elements.sessionName.classList.toggle('invalid', issues.some(issue => issue.path === 'name'));
  $('#prepare-session').disabled = issues.length > 0;
  return { issues, capacity, needs, exceeded };
}

function renderSessionDraftRows() {
  const presets = controller.presets.list();
  const presetOptions = ['<option value="">Aucun</option>', ...presets.map(preset => {
    const key = `${preset.presetId}@${preset.revision}`;
    return `<option value="${escapeHtml(key)}">${escapeHtml(preset.name)}</option>`;
  })].join('');
  sessionDraftRows.innerHTML = sessionDraft.chains.map(chain => {
    const selectedPreset = chain.presetRef ? `${chain.presetRef.presetId}@${chain.presetRef.revision}` : '';
    const options = presetOptions.replace(`value="${escapeHtml(selectedPreset)}"`, `value="${escapeHtml(selectedPreset)}" selected`);
    return `<tr data-draft-chain-id="${escapeHtml(chain.draftChainId)}"><td>${escapeHtml(roleLabels[chain.role])}</td>
      <td><input name="name" value="${escapeHtml(chain.name)}" aria-label="Nom ${escapeHtml(roleLabels[chain.role])}"><div class="row-error"></div></td>
      <td><select name="inputFormat"><option value="mono"${chain.inputFormat === 'mono' ? ' selected' : ''}>Mono</option><option value="stereo"${chain.inputFormat === 'stereo' ? ' selected' : ''}>Stéréo</option></select></td>
      <td><select name="outputFormat"><option value="mono"${chain.outputFormat === 'mono' ? ' selected' : ''}>Mono</option><option value="stereo"${chain.outputFormat === 'stereo' ? ' selected' : ''}>Stéréo</option></select></td>
      <td><select name="presetRef">${options}</select></td>
      <td><input name="color" type="color" value="${escapeHtml(chain.color)}" aria-label="Couleur ${escapeHtml(chain.name || roleLabels[chain.role])}"></td>
      <td><input name="dlNumber" type="number" min="1" step="1" value="${chain.dlNumber ?? ''}" placeholder="—" aria-label="Groupe DLY"></td></tr>`;
  }).join('');
  $('#session-draft-empty').hidden = sessionDraft.chains.length > 0;
  for (const row of sessionDraftRows.rows) {
    const chain = sessionDraft.chains.find(value => value.draftChainId === row.dataset.draftChainId);
    for (const field of row.querySelectorAll('[name]')) field.oninput = () => {
      if (field.name === 'presetRef') {
        const preset = presets.find(value => `${value.presetId}@${value.revision}` === field.value);
        chain.presetRef = preset ? { presetId: preset.presetId, revision: preset.revision } : null;
      } else if (field.name === 'dlNumber') chain.dlNumber = field.value === '' ? null : field.valueAsNumber;
      else chain[field.name] = field.value;
      updateSessionDraftStatus();
    };
  }
  updateSessionDraftStatus();
}

function openSessionDraft() {
  const machines = projectMachines(controller.project);
  const current = controller.activeSession;
  const machineId = current?.targetMachineRef?.machineId || machines[0]?.machineId || null;
  const sampleRate = [48000, 96000].includes(current?.audioGraph?.sampleRate) ? current.audioGraph.sampleRate : 48000;
  sessionDraft = createSessionDraft({ idFactory: controller.idFactory, machineId,
    environmentProfileId: sessionEnvironmentProfiles[0].environmentProfileId, sampleRate });
  createSessionForm.reset();
  const machineSelect = createSessionForm.elements.machine;
  machineSelect.replaceChildren(new Option('Non définie', ''), ...machines.map(machine =>
    new Option(machine.fallback.name, machine.machineId, false, machine.machineId === machineId)));
  const environmentSelect = createSessionForm.elements.environment;
  environmentSelect.replaceChildren(...sessionEnvironmentProfiles.map(profile =>
    new Option(profile.name, profile.environmentProfileId, false, profile.environmentProfileId === sessionDraft.environmentProfileId)));
  createSessionForm.elements.sampleRate.value = String(sampleRate);
  for (const menu of headerMenus) menu.open = false;
  renderSessionDraftRows();
  createSessionDialog.showModal();
  createSessionForm.elements.sessionName.focus();
}

$('#add-session').onclick = openSessionDraft;
$('#cancel-create-session').onclick = () => createSessionDialog.close();
const sessionCountRoles = new Map([['insertCount', 'insert'], ['fxCount', 'fx'], ['monitoringCount', 'monitoring']]);
function updateSessionChainCount(field) {
  const role = sessionCountRoles.get(field.name);
  const count = field.valueAsNumber;
  if (!role || !Number.isSafeInteger(count) || count < 0 || count === sessionDraft.counts[role]) return false;
  const previous = sessionDraft.counts[role];
  const plan = planSessionChainCount(sessionDraft, role, count, controller.idFactory);
  if (plan.confirmationRequired && !confirm('Supprimer les chaînes renseignées situées à la fin de ce groupe ?')) {
    field.value = String(previous);
    return false;
  }
  sessionDraft = applySessionChainCount(sessionDraft, plan);
  renderSessionDraftRows();
  return true;
}
createSessionForm.addEventListener('input', event => updateSessionChainCount(event.target));
createSessionForm.addEventListener('change', event => updateSessionChainCount(event.target));
for (const field of ['sessionName', 'machine', 'environment', 'sampleRate']) {
  createSessionForm.elements[field].oninput = event => {
    const key = { sessionName: 'name', machine: 'machineId', environment: 'environmentProfileId' }[field] || field;
    sessionDraft[key] = field === 'sampleRate' ? Number(event.target.value) : event.target.value || null;
    updateSessionDraftStatus();
  };
}
createSessionForm.onsubmit = event => {
  event.preventDefault();
  for (const fieldName of sessionCountRoles.keys()) updateSessionChainCount(createSessionForm.elements[fieldName]);
  const { issues } = updateSessionDraftStatus();
  if (issues.length) return;
  const result = controller.createSessionFromDraft(sessionDraft, { profiles: sessionEnvironmentProfiles });
  if (result.status !== 'committed') {
    const message = result.diagnostics?.[0]?.message || result.diagnostics?.[0]?.code || 'Création impossible.';
    $('#session-draft-general-errors').textContent = message;
    notify(message, true);
    return;
  }
  createSessionDialog.close(); selectedChainId = null; showView('builder'); render();
  const allocation = result.allocation;
  if (allocation.status === 'partial') notify(`Session créée · patch partiel, ${allocation.missingAssignments.length} affectation(s) à compléter.`);
  else if (allocation.status === 'impossible') notify('Session créée · routing automatique impossible, Patch rapide reste disponible.');
  else notify('Session créée et patchée automatiquement.');
};
$('#demo-project').onclick = async () => {
  try {
    const response = await fetch('../scripts/fixtures/lprep-project-v1.json');
    if (!response.ok) throw new Error('Démo indisponible.');
    const project = prepareDemoProject(await response.json());
    let result = controller.openDemo(project);
    if (result.status === 'confirmation-required') {
      if (!confirm('Charger la démo à la place du projet courant ? Les modifications non sauvegardées seront perdues.')) return;
      result = controller.openDemo(project, { replaceCurrent: true });
    }
    if (result.status === 'opened') {
      selectedChainId = null;
      $('.project-menu').open = false;
    }
    resultNotice(result, 'Démo DRUM/BASS/FX/INSTRUS chargée.');
  } catch (error) { notify(error.message, true); }
};
const renameFields = [
  { name: '#project-name', action: '#rename-project', commit: name => controller.renameProject(name), message: 'Projet renommé.' },
  { name: '#header-session-name', action: '#rename-session', commit: name => controller.renameActiveSession(name), message: 'Session renommée.' }
];
for (const { name, action, commit, message } of renameFields) {
  const label = $(name);
  function startRename() {
    const menu = label.closest('details');
    const summary = label.parentElement;
    if (summary.querySelector('input')) return;
    menu.open = false;
    const field = document.createElement('input');
    field.className = 'header-name-editor';
    field.setAttribute('aria-label', name === '#project-name' ? 'Nom du projet' : 'Nom de la session');
    const original = label.textContent;
    field.value = original;
    label.hidden = true;
    summary.append(field);
    const stop = () => {
      field.onblur = null;
      field.remove();
      label.hidden = false;
    };
    field.onclick = event => event.stopPropagation();
    field.onblur = stop;
    field.onkeydown = event => {
      if (!['Escape', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = field.value.trim();
      if (event.key === 'Enter' && !next) return;
      stop();
      if (event.key === 'Enter' && next !== original) resultNotice(commit(next), message);
      summary.focus({ preventScroll: true });
    };
    field.focus();
    field.select();
  }
  label.ondblclick = event => { event.preventDefault(); startRename(); };
  $(action).onclick = startRename;
}
$('#open-presets').onclick = () => {
  $('#secondary-menu').open = false;
  showView('builder');
  const presets = $('#preset-list');
  if (!presets.hidden) presets.focus();
  else if (!$('#save-preset')) notify('Sélectionnez une chaîne pour créer un preset.');
  else {
    const toggle = $('#toggle-settings');
    if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
    $('#save-preset').focus();
  }
};
$('#duplicate-session').onclick = () => resultNotice(controller.duplicateActiveSession(), 'Session dupliquée.');
$('#session-list').onchange = event => { controller.selectSession(event.target.value); render(); };
const createChainForm = $('#add-chain-menu .chain-create-menu');
createChainForm.elements.role.append(...[...CHAIN_ROLES].map(role => new Option(roleLabels[role], role)));
createChainForm.onsubmit = event => {
  event.preventDefault();
  const { role, inputFormat, outputFormat } = createChainForm.elements;
  const result = controller.createChain({ name: 'Nouvelle chaîne', role: role.value,
    inputFormat: inputFormat.value, outputFormat: outputFormat.value });
  if (result.status === 'committed') {
    selectedChainId = controller.activeSession.chainOrder.at(-1);
    $('#add-chain-menu').open = false;
  }
  resultNotice(result, 'Chaîne créée.');
  if (result.status === 'committed') {
    const chain = controller.activeSession.chains.find(value => value.chainId === selectedChainId);
    const button = $(`.chain-row[data-chain="${CSS.escape(selectedChainId)}"] .chain-label button`);
    if (button && chain) editChainName(button, chain);
  }
};
for (const button of $$('.panel-tab')) {
  const panel = document.getElementById(button.getAttribute('aria-controls'));
  const preferences = panelPreferences[button.id === 'toggle-settings' ? 'settings' : 'library'];
  function setPanel() {
    panel.hidden = !preferences.open;
    button.setAttribute('aria-expanded', String(preferences.open));
  }
  setPanel();
  button.onclick = () => {
    preferences.open = !preferences.open;
    setPanel();
    rememberPanels();
    renderLibrary();
  };
}
for (const button of $$('[data-scope]')) {
  button.onclick = () => {
    libraryScope = button.dataset.scope;
    libraryLimit = 40;
    for (const tab of $$('[data-scope]')) tab.setAttribute('aria-pressed', String(tab === button));
    renderLibrary({ resetScroll: true });
  };
}
if (window.location.protocol === 'lprep:') {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'import-catalog-rights';
  button.textContent = 'Importer ma collection PluginLib';
  button.title = 'Importer les droits depuis un export JSON PluginLib';
  button.onclick = () => picker.click();
  $('#plugin-library .library-tabs').after(button, picker);
  picker.onchange = async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
      if (!catalog) throw new Error('Catalogue indisponible.');
      importCatalogRights(catalog, storage, JSON.parse(await file.text()));
      $('[data-scope="owned"]').click();
      notify('Droits de collection importés.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      picker.value = '';
    }
  };
}

function libraryFilterChanged() {
  libraryLimit = 40;
  renderLibrary({ resetScroll: true });
}
librarySort.onchange = () => {
  librarySortPreference = librarySort.value;
  try { storage?.setItem(librarySortKey, librarySortPreference); } catch { /* Préférence de session. */ }
  libraryFilterChanged();
};
$('#plugin-search').oninput = libraryFilterChanged;
treatmentFilter.onchange = () => { refreshFamilies(); libraryFilterChanged(); };
familyFilter.onchange = libraryFilterChanged;
window.addEventListener('storage', event => {
  if (isCollectionStorageKey(event.key)) renderLibrary();
});
window.addEventListener('online', () => { renderChains(); renderLibrary(); });
$('#clear-patch').onclick = () => {
  const plan = controller.previewClearPatch();
  const kept = plan.kept.map(({ label, reason }) => `• ${label} — ${reason}`).join('\n');
  if (!plan.removable.length) {
    if (kept) alert(`Aucune liaison modifiable. Liaisons conservées :\n${kept}`);
    else notify('Aucune affectation modifiable dans cette session.');
    return;
  }
  const connections = plan.removable.map(({ label }) => `• ${label}`).join('\n');
  if (!confirm(`Retirer les affectations suivantes ?\n\n${connections}${kept ? `\n\nLiaisons conservées :\n${kept}` : ''}`)) return;
  resultNotice(controller.clearPatch(plan.removable.map(item => item.id)),
    `${plan.removable.length} liaison(s) retirée(s). ${plan.kept.length} liaison(s) protégée(s) conservée(s).`);
};
$('#propose-patch').onclick = () => { controller.proposePatch(); renderPatch(); };
$('#undo').onclick = () => resultNotice(controller.undo(), 'Modification annulée.'); $('#redo').onclick = () => resultNotice(controller.redo(), 'Modification rétablie.');
let saveRequest;
function renderSaveStatus() {
  const button = $('#save-project');
  const request = saveRequest?.service === controller.service ? saveRequest : null;
  const state = request?.state || (!controller.lastRevisionId || controller.hasUnsavedChanges ? 'dirty' : 'saved');
  const descriptions = { dirty: 'Modifications non sauvegardées', saved: 'Projet enregistré',
    pending: 'Sauvegarde en cours', error: 'Échec de la sauvegarde' };
  button.dataset.state = state;
  button.title = descriptions[state];
  button.setAttribute('aria-label', `Sauvegarder. ${descriptions[state]}`);
  button.disabled = state === 'pending';
}
$('#save-project').onclick = async () => {
  const request = { service: controller.service, state: 'pending' };
  saveRequest = request;
  renderSaveStatus();
  try {
    const record = await controller.save();
    if (controller.lastRevisionId === record.revisionId) rememberRevision(record.revisionId);
    if (saveRequest === request) saveRequest = null;
    notify('Révision sauvegardée localement.');
    renderSaved();
  } catch (error) {
    request.state = 'error';
    notify(error.message, true);
  } finally { renderSaveStatus(); }
};
$('#export-project').onclick = () => download(`${controller.project.name.replace(/\W+/g, '-')}.lprep.json`, controller.exportJSON());
$('#open-project').onclick = () => $('#open-file').click();
$('#open-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const source = await file.text();
    let result = controller.importJSON(source);
    if (result.status === 'confirmation-required') {
      if (!confirm('Ce projet est déjà ouvert. Le remplacer explicitement ?')) return;
      result = controller.importJSON(source, { replaceCurrent: true });
    }
    if (result.status === 'opened') {
      rememberRevision(null);
      selectedChainId = null;
      $('.project-menu').open = false;
    }
    resultNotice(result, 'Projet ouvert.');
  } catch (error) { notify(error.message, true); }
  finally { event.target.value = ''; }
};
const fullLibrary = $('#full-library-view');
const fullLibraryFrame = $('#full-library-frame');
const openFullLibrary = $('#open-full-library');
function setFullLibraryOpen(open) {
  fullLibrary.hidden = !open;
  $('#builder-view').inert = open;
  openFullLibrary.setAttribute('aria-expanded', String(open));
  if (open) {
    if (!$('#builder-view').classList.contains('active')) showView('builder');
    if (!fullLibraryFrame.hasAttribute('src')) fullLibraryFrame.src = '../index.html?embed=lprep';
    $('#close-full-library').focus({ preventScroll: true });
  } else {
    renderLibrary();
    $('#secondary-menu summary').focus({ preventScroll: true });
  }
}
openFullLibrary.onclick = () => {
  $('#secondary-menu').open = false;
  setFullLibraryOpen(fullLibrary.hidden);
};
$('#close-full-library').onclick = () => setFullLibraryOpen(false);

$('#return-builder').onclick = () => {
  showView('builder');
  const trigger = [...$$('.chain-row')].find(row => row.dataset.chain === patchFocus?.chainId)?.querySelector('.chain-patch');
  trigger?.focus({ preventScroll: true });
};
function showView(view) {
  if (view === 'diagnostics' && !fullLibrary.hidden) setFullLibraryOpen(false);
  const patchOpen = view === 'patch';
  $('#builder-content').inert = patchOpen;
  $('#patch-view').inert = !patchOpen;
  $('.center').classList.toggle('patch-open', patchOpen);
  const mainView = view === 'patch' ? 'builder' : view;
  for (const tab of $$('#secondary-menu [data-view]')) {
    const active = tab.dataset.view === mainView;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  for (const section of $$('.view')) section.classList.toggle('active', section.id === `${mainView}-view`);
  if (view === 'patch') renderPatch();
}
$$('#secondary-menu [data-view]').forEach(button => button.onclick = () => {
  patchFocus = null;
  $('#secondary-menu').open = false;
  showView($('#diagnostics-view').classList.contains('active') ? 'builder' : button.dataset.view);
});

function formatRate(rate) {
  return `${(rate / 1000).toLocaleString('fr-FR')} kHz`;
}

const machineDialog = $('#machine-dialog');
const rateDialog = $('#rate-dialog');
const machineForm = machineDialog.querySelector('form');
const rateForm = rateDialog.querySelector('form');
let audioContext;
for (const dialog of [machineDialog, rateDialog]) {
  dialog.querySelector('[data-close-audio]').onclick = () => dialog.close();
}
function captureAudioContext() {
  audioContext = { service: controller.service, sessionId: controller.activeSessionId,
    revision: controller.service.history.revisionId };
}
function currentAudioContext() {
  return audioContext?.service === controller.service && audioContext.sessionId === controller.activeSessionId &&
    audioContext.revision === controller.service.history.revisionId;
}
function refreshMachineDefinition() {
  const id = machineForm.elements.machine.value;
  const isNew = id === 'new';
  const machine = projectMachines(controller.project).find(item => item.machineId === id);
  const rates = machineSampleRates(machine);
  const editing = isNew || Boolean(machine && machineForm.elements.editRates.checked);
  $('#machine-rates-toggle').hidden = !machine;
  $('#machine-definition').hidden = !editing;
  $('#machine-new-name').hidden = !isNew;
  machineForm.elements.machineName.required = isNew;
  $('#machine-rates').replaceChildren(...[...new Set([...MACHINE_SAMPLE_RATES, ...rates])].sort((a, b) => a - b).map(rate => {
    const label = document.createElement('label');
    label.className = 'settings-check';
    const field = document.createElement('input');
    field.type = 'checkbox';
    field.name = 'machineRate';
    field.value = rate;
    field.checked = rates.includes(rate);
    label.append(field, formatRate(rate));
    return label;
  }));
  const current = controller.activeSession.audioGraph.sampleRate;
  $('#machine-note').textContent = machine && !editing
    ? rates.length ? current !== null && !rates.includes(current)
      ? `La fréquence actuelle (${formatRate(current)}) est incompatible.`
      : `Fréquences déclarées : ${rates.map(formatRate).join(', ')}.`
      : 'Fréquences prises en charge non renseignées.' : '';
}

$('#target-machine').onclick = () => {
  if (!controller.activeSession) return;
  captureAudioContext();
  machineForm.reset();
  machineForm.elements.machine.replaceChildren(new Option('Machine non définie', ''),
    ...projectMachines(controller.project).map(item => new Option(item.fallback.name, item.machineId)),
    new Option('Définir une machine…', 'new'));
  machineForm.elements.machine.value = controller.activeSession.targetMachineRef?.machineId || '';
  refreshMachineDefinition();
  machineDialog.showModal();
};
machineForm.elements.machine.onchange = () => { machineForm.elements.editRates.checked = false; refreshMachineDefinition(); };
machineForm.elements.editRates.onchange = refreshMachineDefinition;
machineForm.onsubmit = event => {
  event.preventDefault();
  if (!currentAudioContext()) { machineDialog.close(); notify('La session a changé.', true); return; }
  const id = machineForm.elements.machine.value;
  const existing = projectMachines(controller.project).find(item => item.machineId === id);
  const definition = !$('#machine-definition').hidden ? {
    name: id === 'new' ? machineForm.elements.machineName.value : existing.fallback.name,
    rates: [...machineForm.querySelectorAll('[name=machineRate]:checked')].map(field => Number(field.value))
  } : null;
  if (!definition && id === (controller.activeSession.targetMachineRef?.machineId || '')) { machineDialog.close(); return; }
  if (!confirm('Mettre à jour la machine cible ou ses fréquences déclarées ?')) return;
  const result = controller.chooseTargetMachine(id && id !== 'new' ? id : null, definition);
  if (result.status === 'committed') { machineDialog.close(); resultNotice(result, 'Machine cible mise à jour.'); }
  else $('#machine-note').textContent = result.diagnostics[0]?.message || 'Machine incompatible.';
};

$('#sample-rate').onclick = () => {
  if (!controller.activeSession) return;
  captureAudioContext();
  const session = controller.activeSession;
  const machine = projectMachines(controller.project).find(ref => ref.machineId === session.targetMachineRef?.machineId);
  const rates = machineSampleRates(machine);
  const current = session.audioGraph.sampleRate;
  rateForm.elements.rate.replaceChildren(new Option('Non définie', ''),
    ...rates.map(rate => new Option(formatRate(rate), rate)));
  if (current !== null && !rates.includes(current)) {
    rateForm.elements.rate.add(new Option(`${formatRate(current)} · fréquence actuelle non vérifiée`, current));
  }
  rateForm.elements.rate.value = current ?? '';
  $('#rate-note').textContent = rates.length
    ? 'Fréquences déclarées pour la machine cible. La compatibilité individuelle des plugins reste à vérifier.'
    : 'Renseignez les fréquences prises en charge dans le sélecteur de machine.';
  rateDialog.showModal();
};
rateForm.onsubmit = event => {
  event.preventDefault();
  if (!currentAudioContext()) { rateDialog.close(); notify('La session a changé.', true); return; }
  const rate = rateForm.elements.rate.value ? Number(rateForm.elements.rate.value) : null;
  if (rate === controller.activeSession.audioGraph.sampleRate) { rateDialog.close(); return; }
  if (!confirm('Modifier la fréquence de la session ? Les latences affichées seront recalculées.')) return;
  const result = controller.chooseSampleRate(rate);
  if (result.status === 'committed') { rateDialog.close(); resultNotice(result, 'Fréquence mise à jour.'); }
  else $('#rate-note').textContent = result.diagnostics[0]?.message || 'Fréquence incompatible.';
};

try {
  const revisionId = storage?.getItem(revisionKey);
  if (revisionId) await controller.openRevision(revisionId);
} catch (error) {
  notify(error.message, true);
}
if (!controller.project) controller.createProject('Mon premier projet');
render();

loadCatalog().then(data => {
  catalog = data;
  catalogById = new Map(data.plugins.map(plugin => [plugin.id, plugin]));
  renderChains();
}).catch(error => { catalogError = error.message; }).finally(() => renderLibrary());
