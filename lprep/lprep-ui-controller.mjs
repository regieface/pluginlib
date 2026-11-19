import { planClearPatch } from './lprep-patch-edit.mjs';
import { setSessionMachine, setSessionSampleRate } from './lprep-audio-settings.mjs';
import { chainFormatPortProperties, createAudioGraph, createAudioNode, createAudioPort } from './lprep-audio-graph.mjs';
import { BrowserRevisionEngine } from './lprep-browser-persistence.mjs';
import { LPrepConstructorService } from './lprep-constructor-services.mjs';
import { createDefaultEnvironmentProfile, instantiateEnvironmentProfile } from './lprep-environment.mjs';
import { createStableId } from './lprep-identifiers.mjs';
import { applyPatchProposal } from './lprep-patch.mjs';
import { createChain, createProject, createSession, duplicateSession, validateProject } from './lprep-project.mjs';
import { createChainPresetFromSession, MemoryPresetStore } from './lprep-presets.mjs';
import { deserializeProject, serializeProject } from './lprep-serialization.mjs';
import { ProjectTransaction } from './lprep-transactions.mjs';
import { setChainSidechainCount } from './lprep-chain-edits.mjs';

const clone = value => structuredClone(value);

export class LPrepUIController {
  constructor({ revisionStore, idFactory = createStableId } = {}) {
    this.idFactory = idFactory; this.revisions = revisionStore ? new BrowserRevisionEngine(revisionStore) : null;
    this.presets = new MemoryPresetStore(); this.service = null; this.activeSessionId = null;
    this.patchProposal = null; this.lastRevisionId = null;
    this.savedHistoryRevisionId = null;
  }
  createProject(name = 'Nouveau projet') {
    const projectId = this.idFactory('project'), sessionId = this.idFactory('session');
    const graph = createAudioGraph({ graphId: this.idFactory('graph'), sessionId });
    const environment = instantiateEnvironmentProfile(createDefaultEnvironmentProfile(), sessionId);
    const session = createSession({ sessionId, projectId, name: 'Session 1', audioGraph: graph, ...environment });
    const project = createProject({ projectId, name, sessions: [session] });
    const result = this.openProject(project);
    if (result.status !== 'opened') throw new Error(result.diagnostics[0]?.message || 'Création du projet impossible.');
    return result.project;
  }
  openProject(project) {
    const diagnostics = validateProject(project).filter(value => value.severity === 'error');
    if (diagnostics.length) return { status: 'invalid', diagnostics };
    this.service = new LPrepConstructorService(project); this.activeSessionId = project.sessions[0]?.sessionId || null;
    this.patchProposal = null; this.lastRevisionId = null;
    this.savedHistoryRevisionId = this.service.history.revisionId;
    return { status: 'opened', project: this.project };
  }
  get hasUnsavedChanges() {
    return Boolean(this.service && this.service.history.revisionId !== this.savedHistoryRevisionId);
  }
  openDemo(template, { replaceCurrent = false } = {}) {
    if (this.hasUnsavedChanges && !replaceCurrent) return { status: 'confirmation-required' };
    const projectId = this.idFactory('project');
    const sessions = template.sessions.map(session => duplicateSession(session, {
      name: session.name, projectId, idFactory: this.idFactory
    }));
    return this.openProject({ ...template, projectId, sessions });
  }
  get project() { return this.service?.project || null; }
  get activeSession() { return this.project?.sessions.find(value => value.sessionId === this.activeSessionId) || null; }
  selectSession(sessionId) { if (!this.project?.sessions.some(value => value.sessionId === sessionId)) return false;
    this.activeSessionId = sessionId; this.patchProposal = null; return true; }
  commit(transaction) { const result = this.service.commit(transaction); if (result.status === 'committed') this.patchProposal = null; return result; }
  renameProject(name) { return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId,
    apply: project => { project.name = String(name).trim(); return project; } })); }
  renameActiveSession(name) {
    const sessionId = this.activeSessionId;
    return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId, apply: project => {
      const session = project.sessions.find(value => value.sessionId === sessionId);
      if (!session) throw new Error('Session introuvable.');
      session.name = String(name).trim();
      return project;
    } }));
  }
  updateAudioSettings(transform) {
    const sessionId = this.activeSessionId;
    return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId, apply: project => {
      const session = project.sessions.find(item => item.sessionId === sessionId);
      if (!session) throw new Error('Session introuvable.');
      transform(project, session);
      return project;
    } }));
  }
  chooseTargetMachine(machineId, definition) {
    return this.updateAudioSettings((project, session) => setSessionMachine(project, session, machineId, definition, this.idFactory));
  }
  chooseSampleRate(rate) {
    return this.updateAudioSettings((project, session) => setSessionSampleRate(project, session, rate));
  }
  createSession(name = 'Nouvelle session') {
    const projectId = this.project.projectId, sessionId = this.idFactory('session');
    const environment = instantiateEnvironmentProfile(createDefaultEnvironmentProfile(), sessionId);
    const session = createSession({ sessionId, projectId, name, audioGraph: createAudioGraph({ graphId: this.idFactory('graph'), sessionId }), ...environment });
    const result = this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId,
      apply: project => { project.sessions.push(session); return project; } }));
    if (result.status === 'committed') this.activeSessionId = sessionId; return result;
  }
  duplicateActiveSession() {
    const transaction = this.service.duplicateSession(this.activeSessionId, { idFactory: this.idFactory });
    const result = this.commit(transaction);
    if (result.status === 'committed') this.activeSessionId = result.project.sessions.at(-1).sessionId;
    return result;
  }
  createChain({ name = 'Nouvelle chaîne', role = 'insert', audioFormat = 'stereo', color = '#6574d8', sidechainCount = 0 } = {}) {
    const sessionId = this.activeSessionId, graphId = this.activeSession.audioGraph.graphId;
    const nodeId = this.idFactory('node'), inputId = this.idFactory('port'), outputId = this.idFactory('port'), chainId = this.idFactory('chain');
    return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId, apply: project => {
      const session = project.sessions.find(value => value.sessionId === sessionId);
      session.audioGraph.nodes.push(createAudioNode({ nodeId, graphId, type: 'bus', label: name }));
      session.audioGraph.ports.push(...[['input', inputId], ['output', outputId]].map(([direction, portId]) =>
        createAudioPort({ portId, nodeId, direction, role: 'main', ...chainFormatPortProperties(audioFormat, direction) })));
      const chain = createChain({ chainId, sessionId, name, role, audioFormat, color, pluginOrder: [],
        mainPath: { inputBoundaryPortRef: inputId, outputBoundaryPortRef: outputId, connectionRefs: [] } });
      setChainSidechainCount(session, chain, sidechainCount, this.idFactory);
      session.chains.push(chain);
      session.chainOrder.push(chainId); return project;
    } }));
  }
  saveActiveChainAsPreset(chainId) {
    const result = createChainPresetFromSession(this.activeSession, chainId, { name: `${this.activeSession.chains.find(value => value.chainId === chainId)?.name} — preset` });
    if (result.status === 'created') this.presets.save(result.preset); return result;
  }
  appendCatalogPlugin(chainId, plugin, variantRef) {
    return this.insertCatalogPlugin(chainId, plugin, null, variantRef);
  }
  insertCatalogPlugin(chainId, plugin, beforeId, variantRef) {
    return this.commit(this.service.prepareCatalogInsertion(this.activeSessionId, chainId, plugin, beforeId,
      { variantRef, idFactory: this.idFactory }));
  }
  moveChain(chainId, beforeId) {
    return this.commit(this.service.prepareMoveChain(this.activeSessionId, chainId, beforeId));
  }
  renameChain(chainId, name) {
    return this.commit(this.service.prepareRenameChain(this.activeSessionId, chainId, name));
  }
  updateChainSettings(chainId, changes) {
    return this.commit(this.service.prepareChainSettings(this.activeSessionId, chainId, changes, this.idFactory));
  }
  editPatch(chainId, target, choice) {
    return this.commit(this.service.preparePatchEdit(this.activeSessionId, chainId, target, choice, this.idFactory));
  }
  movePlugin(chainId, instanceId, beforeId, targetChainId = chainId) {
    return this.commit(this.service.prepareMovePlugin(this.activeSessionId, chainId, instanceId, beforeId, this.idFactory, targetChainId));
  }
  removePlugin(chainId, instanceId) {
    return this.commit(this.service.prepareRemovePlugin(this.activeSessionId, chainId, instanceId, this.idFactory));
  }
  removeChain(chainId) {
    return this.commit(this.service.prepareRemoveChain(this.activeSessionId, chainId));
  }
  insertPreset(presetId, revision) {
    const preset = this.presets.load(presetId, revision); if (!preset) return { status: 'invalid', diagnostics: [{ code: 'preset.missing' }] };
    const prepared = this.service.preparePresetInsertion(this.activeSessionId, preset, { idFactory: this.idFactory });
    return prepared.status === 'prepared' ? this.commit(prepared.transaction) : prepared;
  }
  previewClearPatch() {
    return planClearPatch(this.activeSession);
  }
  clearPatch(connectionIds) {
    const sessionId = this.activeSessionId;
    return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId, apply: project => {
      const index = project.sessions.findIndex(session => session.sessionId === sessionId);
      if (index < 0) throw new Error('Session introuvable.');
      const plan = planClearPatch(project.sessions[index]);
      if (!connectionIds.length || JSON.stringify(plan.removable.map(item => item.id)) !== JSON.stringify(connectionIds)) {
        throw new Error('Le patch a changé. Vérifiez à nouveau les liaisons à retirer.');
      }
      project.sessions[index] = plan.session;
      return project;
    } }));
  }
  proposePatch() { this.patchProposal = this.service.prepareQuickPatch(this.activeSessionId); return clone(this.patchProposal); }
  applyPatch() {
    if (!this.patchProposal?.valid) return { status: 'invalid', diagnostics: this.patchProposal?.issues || [] };
    const sessionId = this.activeSessionId, applied = applyPatchProposal(this.activeSession, this.patchProposal).session;
    return this.commit(new ProjectTransaction({ baseRevisionId: this.service.history.revisionId,
      apply: project => { project.sessions[project.sessions.findIndex(value => value.sessionId === sessionId)] = applied; return project; } }));
  }
  cancelPatch() { this.patchProposal = null; }
  undo() { return this.restoreHistory(this.service.undo()); }
  redo() { return this.restoreHistory(this.service.redo()); }
  restoreHistory(result) {
    const sessions = result.project?.sessions;
    if (sessions && !sessions.some(session => session.sessionId === this.activeSessionId)) {
      this.activeSessionId = sessions[0].sessionId;
    }
    this.patchProposal = null;
    return result;
  }
  diagnostics() { return this.service?.diagnostics() || []; }
  exportJSON() { return serializeProject(this.project); }
  importJSON(source, { replaceCurrent = false } = {}) {
    const project = deserializeProject(source);
    if (this.project?.projectId === project.projectId && !replaceCurrent) return { status: 'confirmation-required', project };
    return this.openProject(project);
  }
  async save() {
    if (!this.revisions) throw new Error('Stockage de révisions indisponible.');
    const service = this.service;
    const historyRevisionId = service.history.revisionId;
    const record = await this.revisions.save(this.project, { parentRevisionId: this.lastRevisionId });
    if (this.service === service) {
      this.lastRevisionId = record.revisionId;
      this.savedHistoryRevisionId = historyRevisionId;
    }
    return record;
  }
  async listSavedProjects() { return this.revisions ? this.revisions.listProjects() : []; }
  async openRevision(revisionId) {
    const loaded = await this.revisions.load(revisionId);
    const result = this.openProject(loaded.project);
    if (result.status !== 'opened') throw new Error(result.diagnostics[0]?.message || 'Révision illisible.');
    this.lastRevisionId = revisionId;
    return loaded;
  }
}
