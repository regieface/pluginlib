import { machineSampleRates, projectMachines } from './lprep-audio-settings.mjs';
import { chainFormatPortProperties, createAudioGraph, createAudioNode, createAudioPort,
  legacyChainFormats } from './lprep-audio-graph.mjs';
import { instantiateEnvironmentProfile } from './lprep-environment.mjs';
import { applyPatchProposal, proposeQuickPatch } from './lprep-patch.mjs';
import { preparePresetInsertion } from './lprep-presets.mjs';
import { createChain, createCompensationGroup, createSession, validateProject } from './lprep-project.mjs';
import { validateSessionDraft } from './lprep-session-draft.mjs';
import { ProjectTransaction } from './lprep-transactions.mjs';

const clone = value => structuredClone(value);
const diagnostic = (path, code, message, severity = 'error') => ({ path, code, message, severity });

function presetFormats(preset) {
  const chain = preset?.structure?.chain;
  return chain?.audioFormat === undefined ?
    { inputFormat: chain?.inputFormat, outputFormat: chain?.outputFormat } : legacyChainFormats(chain.audioFormat);
}

function appendBlankChain(session, draftChain, idFactory) {
  const graph = session.audioGraph;
  const nodeId = idFactory('node'), inputId = idFactory('port'), outputId = idFactory('port');
  const chainId = idFactory('chain');
  graph.nodes.push(createAudioNode({ nodeId, graphId: graph.graphId, type: 'bus', label: draftChain.name }));
  graph.ports.push(createAudioPort({ portId: inputId, nodeId, direction: 'input', role: 'main',
    ...chainFormatPortProperties(draftChain, 'input') }));
  graph.ports.push(createAudioPort({ portId: outputId, nodeId, direction: 'output', role: 'main',
    ...chainFormatPortProperties(draftChain, 'output') }));
  session.chains.push(createChain({ chainId, sessionId: session.sessionId, name: draftChain.name.trim(),
    role: draftChain.role, inputFormat: draftChain.inputFormat, outputFormat: draftChain.outputFormat,
    color: draftChain.color, mainPath: { inputBoundaryPortRef: inputId, outputBoundaryPortRef: outputId,
      connectionRefs: [] } }));
  session.chainOrder.push(chainId);
  return chainId;
}

function applyCompensationGroups(session, created, draft, idFactory) {
  const groups = new Map();
  draft.chains.forEach((draftChain, index) => {
    if (draftChain.dlNumber === null) return;
    let group = groups.get(draftChain.dlNumber);
    if (!group) {
      group = createCompensationGroup({ compensationGroupId: idFactory('compensation-group'),
        sessionId: session.sessionId, name: `DL${draftChain.dlNumber}`,
        metadata: { dlNumber: draftChain.dlNumber } });
      groups.set(draftChain.dlNumber, group);
      session.compensationGroups.push(group);
    }
    const chain = session.chains.find(value => value.chainId === created[index]);
    chain.compensationGroupId = group.compensationGroupId;
    group.memberChainRefs.push(chain.chainId);
  });
}

export function prepareSessionCreation(project, draft, { profiles = [], presets = [], idFactory,
  baseRevisionId } = {}) {
  if (typeof idFactory !== 'function') throw new TypeError('Fabrique d’identifiants requise.');
  const machines = projectMachines(project);
  const draftIssues = validateSessionDraft(draft, { machines, profiles, presets })
    .map(issue => ({ ...issue, severity: 'error' }));
  if (draftIssues.length) return { status: 'invalid', diagnostics: draftIssues };
  const profile = profiles.find(value => value.environmentProfileId === draft.environmentProfileId);
  const machine = draft.machineId === null ? null : machines.find(value => value.machineId === draft.machineId);
  const rates = machineSampleRates(machine);
  if (machine && rates.length && !rates.includes(draft.sampleRate)) {
    return { status: 'invalid', diagnostics: [diagnostic('sampleRate', 'session-creation.machine-rate',
      'La fréquence sélectionnée n’est pas déclarée pour la machine cible.')] };
  }

  let candidate = clone(project);
  const sessionId = idFactory('session');
  const environment = instantiateEnvironmentProfile(profile, sessionId);
  const session = createSession({ sessionId, projectId: candidate.projectId, name: draft.name.trim(),
    targetMachineRef: machine, audioGraph: createAudioGraph({ graphId: idFactory('graph'), sessionId,
      sampleRate: draft.sampleRate }), ...environment });
  candidate.sessions.push(session);
  const createdChainIds = [];

  for (const [index, draftChain] of draft.chains.entries()) {
    if (!draftChain.presetRef) {
      createdChainIds.push(appendBlankChain(session, draftChain, idFactory));
      continue;
    }
    const preset = presets.find(value => value.presetId === draftChain.presetRef.presetId &&
      value.revision === draftChain.presetRef.revision);
    const formats = presetFormats(preset);
    if (formats.inputFormat !== draftChain.inputFormat || formats.outputFormat !== draftChain.outputFormat) {
      return { status: 'invalid', diagnostics: [diagnostic(`chains.${draftChain.draftChainId}.presetRef`,
        'session-creation.preset-format',
        `Le preset « ${preset.name} » utilise ${formats.inputFormat} → ${formats.outputFormat}, incompatible avec ${draftChain.inputFormat} → ${draftChain.outputFormat}.`)] };
    }
    const inserted = preparePresetInsertion(candidate, sessionId, preset, { idFactory });
    if (inserted.status !== 'prepared') return { status: 'invalid', diagnostics: inserted.diagnostics };
    candidate = inserted.project;
    const insertedSession = candidate.sessions.find(value => value.sessionId === sessionId);
    const chain = insertedSession.chains.find(value => value.chainId === inserted.chainId);
    Object.assign(chain, { name: draftChain.name.trim(), role: draftChain.role, color: draftChain.color });
    const node = insertedSession.audioGraph.nodes.find(value =>
      insertedSession.audioGraph.ports.some(port => port.nodeId === value.nodeId &&
        port.portId === chain.mainPath.inputBoundaryPortRef));
    if (node?.type === 'bus') node.label = chain.name;
    createdChainIds.push(chain.chainId);
  }

  const completed = candidate.sessions.find(value => value.sessionId === sessionId);
  applyCompensationGroups(completed, createdChainIds, draft, idFactory);
  const allocation = proposeQuickPatch(completed);
  if (allocation.status === 'error') {
    return { status: 'error', diagnostics: allocation.issues.length ? allocation.issues :
      [diagnostic('autopatch', 'session-creation.autopatch', 'AUTOPATCH a rencontré une erreur technique.')] };
  }
  if (allocation.status === 'complete' || allocation.status === 'partial') {
    candidate.sessions[candidate.sessions.findIndex(value => value.sessionId === sessionId)] =
      applyPatchProposal(completed, allocation).session;
  }
  const errors = validateProject(candidate).filter(value => value.severity === 'error');
  if (errors.length) return { status: 'invalid', diagnostics: errors };
  const allocationSummary = { status: allocation.status, issues: clone(allocation.issues),
    missingAssignments: clone(allocation.missingAssignments), diff: clone(allocation.diff) };
  return { status: 'prepared', sessionId, createdChainIds, allocation: allocationSummary,
    transaction: new ProjectTransaction({ baseRevisionId, description: `Création de la session ${draft.name.trim()}`,
      apply: () => clone(candidate) }) };
}
