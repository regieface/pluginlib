import { createStableId } from './lprep-identifiers.mjs';
import { validateProject } from './lprep-project.mjs';

const clone = value => structuredClone(value);
const errors = project => validateProject(project).filter(value => value.severity === 'error');
const OWNED_ID_KEYS = new Set(['projectId', 'sessionId', 'graphId', 'instanceId', 'nodeId', 'portId',
  'connectionId', 'chainId', 'compensationGroupId', 'assignmentId', 'reservationId', 'replacementId']);
function ownedIds(value, result = new Set()) {
  if (!value || typeof value !== 'object') return result;
  if (Array.isArray(value)) { value.forEach(item => ownedIds(item, result)); return result; }
  for (const [key, child] of Object.entries(value)) {
    if (OWNED_ID_KEYS.has(key) && typeof child === 'string') result.add(child);
    else ownedIds(child, result);
  }
  return result;
}

export class ProjectTransaction {
  constructor({ transactionId = createStableId('transaction'), baseRevisionId, description = '', apply }) {
    if (typeof apply !== 'function') throw new TypeError('Transformation de transaction requise.');
    this.transactionId = transactionId; this.baseRevisionId = baseRevisionId; this.description = description; this.apply = apply;
  }
  prepare(project, currentRevisionId) {
    if (this.baseRevisionId !== currentRevisionId) return { status: 'conflict', diagnostics: [{ code: 'transaction.revision-conflict', expected: this.baseRevisionId, actual: currentRevisionId }] };
    const source = clone(project);
    let candidate;
    try { candidate = this.apply(clone(source)); }
    catch (cause) { return { status: 'error', diagnostics: [{ code: 'transaction.exception', message: cause.message }] }; }
    if (!candidate || typeof candidate !== 'object') return { status: 'error', diagnostics: [{ code: 'transaction.result', message: 'Document candidat absent.' }] };
    const diagnostics = errors(candidate);
    if (diagnostics.length) return { status: 'invalid', diagnostics };
    return { status: 'prepared', transactionId: this.transactionId, baseRevisionId: currentRevisionId,
      before: source, after: clone(candidate), diagnostics: [] };
  }
}

export class ProjectHistory {
  constructor(project, { revisionId = 'revision:initial', idFactory = kind => createStableId(kind) } = {}) {
    const diagnostics = errors(project); if (diagnostics.length) throw new ProjectTransactionError('Projet initial invalide.', diagnostics);
    this.project = clone(project); this.revisionId = revisionId; this.idFactory = idFactory; this.undoStack = []; this.redoStack = [];
    this.usedIds = new Set(); this.retiredObjectIds = new Set();
  }
  commit(transaction) {
    const prepared = transaction.prepare(this.project, this.revisionId);
    if (prepared.status !== 'prepared') return prepared;
    const beforeIds = ownedIds(prepared.before), afterIds = ownedIds(prepared.after);
    const recycled = [...afterIds].filter(id => !beforeIds.has(id) && this.retiredObjectIds.has(id));
    if (recycled.length) return { status: 'invalid', diagnostics: recycled.map(id => ({ code: 'transaction.id-recycled', id })) };
    const nextRevisionId = this.idFactory('revision');
    if (this.usedIds.has(nextRevisionId)) throw new ProjectTransactionError('Identifiant de révision recyclé.', []);
    this.usedIds.add(nextRevisionId);
    this.undoStack.push({ before: prepared.before, after: prepared.after, previousRevisionId: this.revisionId,
      revisionId: nextRevisionId, transactionId: transaction.transactionId });
    this.project = clone(prepared.after); this.revisionId = nextRevisionId; this.redoStack = [];
    return { status: 'committed', project: clone(this.project), revisionId: this.revisionId, transactionId: transaction.transactionId };
  }
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return { status: 'unavailable', diagnostics: [{ code: 'history.undo-empty' }] };
    const beforeIds = ownedIds(entry.before), afterIds = ownedIds(entry.after);
    for (const id of afterIds) if (!beforeIds.has(id)) this.retiredObjectIds.add(id);
    this.redoStack.push(entry); this.project = clone(entry.before); this.revisionId = entry.previousRevisionId;
    return { status: 'undone', project: clone(this.project), revisionId: this.revisionId, transactionId: entry.transactionId };
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return { status: 'unavailable', diagnostics: [{ code: 'history.redo-empty' }] };
    if (this.revisionId !== entry.previousRevisionId) return { status: 'conflict', diagnostics: [{ code: 'history.revision-conflict' }] };
    this.undoStack.push(entry); this.project = clone(entry.after); this.revisionId = entry.revisionId;
    return { status: 'redone', project: clone(this.project), revisionId: this.revisionId, transactionId: entry.transactionId };
  }
}

export class ProjectTransactionError extends Error {
  constructor(message, diagnostics) { super(message); this.name = 'ProjectTransactionError'; this.diagnostics = clone(diagnostics); }
}
