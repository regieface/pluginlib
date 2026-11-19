import { createCompensationGroup, createPluginInstance, createProject, createSession, duplicateSession, validateProject } from './lprep-project.mjs';
import { createAudioNode, createAudioPort } from './lprep-audio-graph.mjs';
import { createStableId, isStableId } from './lprep-identifiers.mjs';
import { createPresetInsertionTransaction } from './lprep-presets.mjs';
import { proposeQuickPatch } from './lprep-patch.mjs';
import { editPatch } from './lprep-patch-edit.mjs';
import { ProjectHistory, ProjectTransaction } from './lprep-transactions.mjs';
import { editableFormatPorts, insertStage, moveBefore, removeChain, removePlugin, reorderPlugin, setChainSidechainCount, transferPlugin } from './lprep-chain-edits.mjs';

const clone = value => structuredClone(value);

export function dlGroupNumbers(groups) {
  const numbers = new Map(), used = new Set();
  for (const group of groups) {
    const number = group.metadata?.dlNumber;
    if (Number.isSafeInteger(number) && number > 0 && !used.has(number)) {
      numbers.set(group.compensationGroupId, number);
      used.add(number);
    }
  }
  groups.forEach((group, index) => {
    if (numbers.has(group.compensationGroupId)) return;
    let number = index + 1;
    while (used.has(number)) number++;
    numbers.set(group.compensationGroupId, number);
    used.add(number);
  });
  return numbers;
}

export class LPrepConstructorService {
  constructor(project, options = {}) { this.history = new ProjectHistory(project, options); }
  get project() { return clone(this.history.project); }
  listChains(sessionId) { const session = this.history.project.sessions.find(value => value.sessionId === sessionId);
    return session ? session.chainOrder.map(id => clone(session.chains.find(value => value.chainId === id))) : []; }
  diagnostics() { return validateProject(this.history.project); }
  preparePresetInsertion(sessionId, preset, options = {}) { return createPresetInsertionTransaction(this.history.project, sessionId, preset,
    { ...options, baseRevisionId: this.history.revisionId }); }
  commit(transaction) { return this.history.commit(transaction); }
  undo() { return this.history.undo(); }
  redo() { return this.history.redo(); }
  prepareQuickPatch(sessionId) { const session = this.history.project.sessions.find(value => value.sessionId === sessionId); return session ? proposeQuickPatch(session) : null; }
  preparePluginOrderChange(sessionId, chainId, pluginOrder) { return new ProjectTransaction({ baseRevisionId: this.history.revisionId,
    apply: project => { const session = project.sessions.find(value => value.sessionId === sessionId); const chain = session?.chains.find(value => value.chainId === chainId);
      if (!chain) throw new Error('Chaîne introuvable.'); chain.pluginOrder = [...pluginOrder]; return project; } }); }
  prepareGraphChange(transform) { return new ProjectTransaction({ baseRevisionId: this.history.revisionId,
    apply: project => transform(project) }); }
  preparePluginInsertion(sessionId, chainId, { instance, node, ports = [], connections = [], pluginOrder, mainPath, movePatchOutput = false }) {
    return this.prepareGraphChange(project => {
      const session = project.sessions.find(value => value.sessionId === sessionId);
      const chain = session?.chains.find(value => value.chainId === chainId);
      if (!session || !chain) throw new Error('Session ou chaîne introuvable.');
      if (!instance || !node || !Array.isArray(pluginOrder) || !mainPath) throw new Error('Instance, nœud, ordre et chemin explicites requis.');
      session.pluginInstances.push(clone(instance)); session.audioGraph.nodes.push(clone(node));
      session.audioGraph.ports.push(...clone(ports)); session.audioGraph.connections.push(...clone(connections));
      if (movePatchOutput) {
        const previousOutput = chain.mainPath.outputBoundaryPortRef;
        const nextOutput = mainPath.outputBoundaryPortRef;
        for (const assignment of session.patchAssignments || []) {
          if (assignment.chainId !== chainId || assignment.direction !== 'output' ||
            !assignment.targetPortRefs.includes(previousOutput)) continue;
          assignment.targetPortRefs = assignment.targetPortRefs.map(ref => ref === previousOutput ? nextOutput : ref);
          for (const connection of session.audioGraph.connections) {
            if (connection.originAssignmentId === assignment.assignmentId && connection.sourcePortId === previousOutput) {
              connection.sourcePortId = nextOutput;
            }
          }
        }
      }
      chain.pluginOrder = [...pluginOrder]; chain.mainPath = clone(mainPath); return project;
    });
  }
  prepareChainEdit(sessionId, chainId, edit) {
    return this.prepareGraphChange(project => {
      const session = project.sessions.find(value => value.sessionId === sessionId);
      const chain = session?.chains.find(value => value.chainId === chainId);
      if (!chain) throw new Error('Chaîne introuvable.');
      edit(session, chain);
      return project;
    });
  }
  prepareMoveChain(sessionId, chainId, beforeId) {
    return this.prepareChainEdit(sessionId, chainId, session => {
      session.chainOrder = moveBefore(session.chainOrder, chainId, beforeId);
    });
  }
  prepareRenameChain(sessionId, chainId, name) {
    return this.prepareChainSettings(sessionId, chainId, { name });
  }
  preparePatchEdit(sessionId, chainId, target, choice, idFactory) {
    return this.prepareChainEdit(sessionId, chainId, (session, chain) => editPatch(session, chain, target, choice, idFactory));
  }
  prepareChainSettings(sessionId, chainId, changes, idFactory = createStableId) {
    return this.prepareChainEdit(sessionId, chainId, (session, chain) => {
      const { name, role, color, audioFormat, allocationEligibility } = changes;
      if (name !== undefined) chain.name = name.trim();
      if (role !== undefined) chain.role = role;
      if (changes.sidechainCount !== undefined) setChainSidechainCount(session, chain, changes.sidechainCount, idFactory);
      if (color !== undefined) chain.color = color;
      if (allocationEligibility !== undefined) {
        if (typeof allocationEligibility !== 'boolean') throw new Error('Éligibilité au Patch rapide invalide.');
        chain.allocationEligibility = allocationEligibility;
      }
      if (audioFormat !== undefined && audioFormat !== chain.audioFormat) {
        const ports = editableFormatPorts(session, chain);
        if (!ports || !['mono', 'stereo'].includes(audioFormat)) {
          throw new Error('Le format peut être modifié sur une chaîne vide et sans routing.');
        }
        for (const port of ports) {
          port.channelCount = audioFormat === 'mono' ? 1 : 2;
          port.channelLayout = audioFormat;
        }
        chain.audioFormat = audioFormat;
      }
      let { compensationGroupId } = changes;
      if (changes.dlNumber !== undefined) {
        const number = changes.dlNumber;
        if (number !== null && (!Number.isSafeInteger(number) || number < 1)) {
          throw new Error('Saisissez un numéro DL entier positif, ou laissez le champ vide.');
        }
        compensationGroupId = null;
        if (number !== null) {
          compensationGroupId = [...dlGroupNumbers(session.compensationGroups)].find(([, value]) => value === number)?.[0];
          if (!compensationGroupId) {
            compensationGroupId = idFactory('compensation-group');
            session.compensationGroups.push(createCompensationGroup({
              compensationGroupId, sessionId, name: `DL${number}`, metadata: { dlNumber: number }
            }));
          }
        }
      }
      if (compensationGroupId !== undefined && compensationGroupId !== chain.compensationGroupId) {
        const group = session.compensationGroups.find(value => value.compensationGroupId === compensationGroupId);
        if (compensationGroupId !== null && !group) throw new Error('Groupe de compensation introuvable.');
        const previous = session.compensationGroups.find(value => value.compensationGroupId === chain.compensationGroupId);
        if (previous) previous.memberChainRefs = previous.memberChainRefs.filter(id => id !== chainId);
        if (group) group.memberChainRefs.push(chainId);
        chain.compensationGroupId = compensationGroupId;
      }
    });
  }
  prepareMovePlugin(sessionId, chainId, instanceId, beforeId, idFactory, targetChainId = chainId) {
    return this.prepareChainEdit(sessionId, chainId, (session, chain) => {
      if (targetChainId === chainId) {
        reorderPlugin(session, chain, instanceId, beforeId, idFactory);
        return;
      }
      const target = session.chains.find(value => value.chainId === targetChainId);
      if (!target) throw new Error('Chaîne de destination introuvable.');
      transferPlugin(session, chain, target, instanceId, beforeId, idFactory);
    });
  }
  prepareRemovePlugin(sessionId, chainId, instanceId, idFactory) {
    return this.prepareChainEdit(sessionId, chainId, (session, chain) => {
      removePlugin(session, chain, instanceId, idFactory);
    });
  }
  prepareRemoveChain(sessionId, chainId) {
    return this.prepareChainEdit(sessionId, chainId, removeChain);
  }
  prepareCatalogAppend(sessionId, chainId, plugin, options = {}) {
    return this.prepareCatalogInsertion(sessionId, chainId, plugin, null, options);
  }
  prepareCatalogInsertion(sessionId, chainId, plugin, beforeId, { variantRef = null, idFactory = createStableId } = {}) {
    return this.prepareChainEdit(sessionId, chainId, (session, chain) => {
      if (!isStableId(plugin?.id) || !plugin.name?.trim() || !plugin.vendor?.trim()) {
        throw new Error('Fiche catalogue incomplète.');
      }
      const instance = createPluginInstance({
        instanceId: idFactory('instance'), sessionId, displayName: plugin.name,
        catalogRef: { pluginId: plugin.id, fallback: { name: plugin.name, vendor: plugin.vendor } },
        variantRef, resolutionStatus: variantRef ? 'resolved' : 'unresolved'
      });
      const graph = session.audioGraph;
      const node = createAudioNode({
        nodeId: idFactory('node'), graphId: graph.graphId, type: 'plugin-instance', instanceRef: instance.instanceId, label: plugin.name
      });
      const ports = ['input', 'output'].map(direction => createAudioPort({
        portId: idFactory('port'), nodeId: node.nodeId, direction, role: 'main'
      }));
      session.pluginInstances.push(instance);
      graph.nodes.push(node);
      graph.ports.push(...ports);
      insertStage(session, chain, node, ports, beforeId, idFactory);
    });
  }
  duplicateSession(sessionId, options = {}) { return new ProjectTransaction({ baseRevisionId: this.history.revisionId,
    apply: project => { const source = project.sessions.find(value => value.sessionId === sessionId); project.sessions.push(duplicateSession(source, options)); return project; } }); }
  static createProject(args) { return createProject(args); }
  static createSession(args) { return createSession(args); }
  static duplicateProject(project, { projectId, name = `${project.name} — copie`, idFactory } = {}) {
    const nextProjectId = projectId || idFactory?.('project', project.projectId);
    if (!nextProjectId) throw new TypeError('Un projectId cible ou un idFactory est requis.');
    const result = createProject({ ...clone(project), projectId: nextProjectId, name, sessions: [] });
    result.sessions = project.sessions.map(session => duplicateSession(session, { projectId: nextProjectId, idFactory }));
    return result;
  }
}
