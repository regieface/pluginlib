import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStableId } from './lprep-identifiers.mjs';
import { assertRevisionParent, RevisionConflictError, RevisionEngine, RevisionError } from './lprep-revision-engine.mjs';

const clone = value => structuredClone(value);
export const integrityHash = text => createHash('sha256').update(text, 'utf8').digest('hex');

export class MemoryRevisionStore {
  constructor() { this.complete = new Map(); this.pending = new Map(); }
  async begin(record) {
    if (this.pending.has(record.revisionId) || this.complete.has(record.revisionId)) {
      throw new Error('Identifiant de révision déjà utilisé.');
    }
    this.pending.set(record.revisionId, clone(record));
  }
  async commit(revisionId, { projectId, expectedParentRevisionId } = {}) {
    const value = this.pending.get(revisionId); if (!value) throw new Error('Révision en attente introuvable.');
    assertRevisionParent([...this.complete.values()], projectId, expectedParentRevisionId);
    this.complete.set(revisionId, value); this.pending.delete(revisionId);
  }
  async listComplete() { return [...this.complete.values()].map(clone); }
  async listPending() { return [...this.pending.values()].map(clone); }
  async read(revisionId) { return clone(this.complete.get(revisionId) || null); }
  async removePending(revisionId) { this.pending.delete(revisionId); }
  async removeComplete(revisionId) { this.complete.delete(revisionId); }
}

export class FileRevisionStore {
  constructor(directory) { this.directory = directory; }
  path(revisionId, suffix) { return join(this.directory, `${encodeURIComponent(revisionId)}.${suffix}`); }
  async begin(record) { await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(record.revisionId, 'pending'), `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'wx' }); }
  async commit(revisionId, { projectId, expectedParentRevisionId } = {}) {
    await mkdir(this.directory, { recursive: true }); const lock = join(this.directory, '.commit.lock');
    const handle = await open(lock, 'wx');
    try {
      const complete = await this.listComplete();
      assertRevisionParent(complete, projectId, expectedParentRevisionId);
      if (complete.some(record => record.revisionId === revisionId)) throw new Error('Identifiant de révision déjà utilisé.');
      await rename(this.path(revisionId, 'pending'), this.path(revisionId, 'json'));
    } finally {
      try { await handle.close(); } finally { await unlink(lock); }
    }
  }
  async records(suffix) { await mkdir(this.directory, { recursive: true });
    const names = (await readdir(this.directory)).filter(name => name.endsWith(`.${suffix}`)).sort();
    return Promise.all(names.map(async name => JSON.parse(await readFile(join(this.directory, name), 'utf8')))); }
  async listComplete() { return this.records('json'); }
  async listPending() { return this.records('pending'); }
  async read(revisionId) { try { return JSON.parse(await readFile(this.path(revisionId, 'json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
  async removePending(revisionId) { try { await unlink(this.path(revisionId, 'pending')); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  async removeComplete(revisionId) { try { await unlink(this.path(revisionId, 'json')); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

export class ProjectRevisionEngine extends RevisionEngine {
  constructor(store, options = {}) { super(store, { hash: async text => integrityHash(text),
    idFactory: kind => createStableId(kind), ...options }); }
}

export { RevisionConflictError, RevisionError };
