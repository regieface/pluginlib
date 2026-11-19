import { L_PREP_SCHEMA_VERSION } from './lprep-project.mjs';
import { deserializeProject, serializeProject } from './lprep-serialization.mjs';

const clone = value => structuredClone(value);
const newestFirst = records => [...records].sort((a, b) =>
  b.committedAt.localeCompare(a.committedAt) || b.revisionId.localeCompare(a.revisionId));

export function assertRevisionParent(records, projectId, expectedParentRevisionId) {
  const latest = newestFirst(records.filter(record => record.projectId === projectId))[0] ?? null;
  const actualRevisionId = latest?.revisionId ?? null;
  if (actualRevisionId !== expectedParentRevisionId) {
    throw new RevisionConflictError(actualRevisionId, expectedParentRevisionId);
  }
  return latest;
}

export class RevisionEngine {
  constructor(store, { hash, idFactory, clock = () => new Date().toISOString(),
    retention = { maxPerProject: 50, recoveryCopies: 3 } } = {}) {
    if (typeof hash !== 'function' || typeof idFactory !== 'function') throw new TypeError('Hash et fabrique d’identifiants requis.');
    this.store = store; this.hash = hash; this.idFactory = idFactory; this.clock = clock; this.retention = retention;
  }
  async save(project, { parentRevisionId = null, transactionId } = {}) {
    if (project?.schemaVersion > L_PREP_SCHEMA_VERSION) throw new RevisionError('Version future refusée en écriture.', [{ code: 'revision.future-schema' }]);
    const document = serializeProject(project), integrityHash = await this.hash(document);
    const latest = assertRevisionParent(await this.store.listComplete(), project.projectId, parentRevisionId);
    if (latest?.integrityHash === integrityHash) return { ...clone(latest), unchanged: true, prunedRevisionIds: [] };
    const revisionId = this.idFactory('revision');
    const now = this.clock();
    const committedAt = latest && now <= latest.committedAt
      ? new Date(Date.parse(latest.committedAt) + 1).toISOString() : now;
    const record = { revisionId, parentRevisionId, transactionId, committedAt, schemaVersion: project.schemaVersion,
      projectId: project.projectId, documentSnapshotRef: { kind: 'embedded-json', document }, integrityHash };
    await this.store.begin(record);
    try { await this.store.commit(revisionId, { projectId: project.projectId, expectedParentRevisionId: parentRevisionId }); }
    catch (error) { throw error?.code === 'revision.conflict' ? new RevisionConflictError(error.actualRevisionId, parentRevisionId) : error; }
    const prunedRevisionIds = await this.applyRetention(project.projectId, revisionId);
    return { ...clone(record), unchanged: false, prunedRevisionIds };
  }
  async load(revisionId) {
    const record = await this.store.read(revisionId);
    if (!record) throw new RevisionError('Révision complète introuvable.', [{ code: 'revision.missing' }]);
    const document = record.documentSnapshotRef?.document;
    if (typeof document !== 'string' || await this.hash(document) !== record.integrityHash) {
      throw new RevisionError('Révision corrompue.', [{ code: 'revision.integrity' }]);
    }
    return { record: clone(record), project: deserializeProject(document) };
  }
  async recoverLatest(projectId = null) {
    const records = newestFirst((await this.store.listComplete()).filter(record => !projectId || record.projectId === projectId));
    const skippedCorruptRevisions = [];
    for (const record of records) {
      try { return { ...(await this.load(record.revisionId)), skippedCorruptRevisions,
        interruptedWrites: await this.interruptedWrites(projectId) }; }
      catch (error) { skippedCorruptRevisions.push({ revisionId: record.revisionId, diagnostics: error.diagnostics || [] }); }
    }
    throw new RevisionError('Aucune révision complète valide.', skippedCorruptRevisions);
  }
  async interruptedWrites(projectId = null) {
    if (typeof this.store.listPending !== 'function') return [];
    return (await this.store.listPending()).filter(record => !projectId || record.projectId === projectId).map(clone);
  }
  async cleanupInterrupted({ revisionIds, confirmed = false } = {}) {
    if (!confirmed) throw new RevisionError('Confirmation requise pour nettoyer les écritures interrompues.', [{ code: 'revision.cleanup-confirmation' }]);
    if (!Array.isArray(revisionIds) || typeof this.store.removePending !== 'function') return [];
    const pending = new Set((await this.store.listPending()).map(record => record.revisionId)), removed = [];
    for (const revisionId of revisionIds) if (pending.has(revisionId)) { await this.store.removePending(revisionId); removed.push(revisionId); }
    return removed;
  }
  async applyRetention(projectId, activeRevisionId) {
    const max = this.retention?.maxPerProject;
    if (!Number.isInteger(max) || max < 1 || typeof this.store.removeComplete !== 'function') return [];
    const records = newestFirst((await this.store.listComplete()).filter(record => record.projectId === projectId));
    if (records.length <= max) return [];
    const recoveryCopies = Math.max(1, this.retention.recoveryCopies || 1);
    const protectedIds = new Set([activeRevisionId, ...records.slice(0, recoveryCopies).map(record => record.revisionId)]);
    const removable = records.slice(max).filter(record => !protectedIds.has(record.revisionId));
    for (const record of removable) await this.store.removeComplete(record.revisionId);
    return removable.map(record => record.revisionId);
  }
  async listProjects() {
    const latest = new Map();
    for (const record of newestFirst(await this.store.listComplete())) if (!latest.has(record.projectId)) latest.set(record.projectId, record);
    return [...latest.values()].map(clone);
  }
}

export class RevisionError extends Error {
  constructor(message, diagnostics) { super(message); this.name = 'RevisionError'; this.diagnostics = clone(diagnostics); }
}
export class RevisionConflictError extends RevisionError {
  constructor(actualRevisionId, expectedRevisionId) {
    super('Une révision plus récente existe déjà.', [{ code: 'revision.conflict', actualRevisionId, expectedRevisionId }]);
    this.name = 'RevisionConflictError'; this.actualRevisionId = actualRevisionId; this.expectedRevisionId = expectedRevisionId;
  }
}
