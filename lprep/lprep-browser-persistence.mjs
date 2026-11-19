import { createStableId } from './lprep-identifiers.mjs';
import { assertRevisionParent, RevisionEngine } from './lprep-revision-engine.mjs';

async function sha256(text) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class BrowserRevisionEngine extends RevisionEngine {
  constructor(store, options = {}) {
    super(store, { hash: sha256, idFactory: createStableId, ...options });
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBRevisionStore {
  constructor({ databaseName = 'lprep-revisions' } = {}) {
    this.databaseName = databaseName;
  }

  connect() {
    if (!this.connection) {
      const request = globalThis.indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('complete', { keyPath: 'revisionId' });
        request.result.createObjectStore('pending', { keyPath: 'revisionId' });
      };
      this.connection = requestResult(request).then(database => {
        database.onversionchange = () => {
          database.close();
          this.connection = null;
        };
        return database;
      }).catch(error => {
        this.connection = null;
        throw error;
      });
    }
    return this.connection;
  }

  async transact(stores, mode, operation) {
    const database = await this.connect();
    const transaction = database.transaction(stores, mode);
    const completed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onabort = () => reject(transaction.error ?? new Error('Transaction IndexedDB annulée.'));
    });
    const result = (async () => {
      try {
        return await operation(transaction);
      } catch (error) {
        try { transaction.abort(); } catch { /* IndexedDB peut avoir déjà annulé la transaction. */ }
        throw error;
      }
    })();
    const [value] = await Promise.all([result, completed]);
    return value;
  }

  begin(record) {
    return this.transact(['complete', 'pending'], 'readwrite', async transaction => {
      const complete = transaction.objectStore('complete');
      if (await requestResult(complete.getKey(record.revisionId)) !== undefined) {
        throw new Error('Identifiant de révision déjà utilisé.');
      }
      await requestResult(transaction.objectStore('pending').add(record));
    });
  }

  commit(revisionId, { projectId, expectedParentRevisionId } = {}) {
    return this.transact(['complete', 'pending'], 'readwrite', async transaction => {
      const complete = transaction.objectStore('complete');
      const pending = transaction.objectStore('pending');
      const record = await requestResult(pending.get(revisionId));
      if (!record) throw new Error('Révision en attente introuvable.');
      assertRevisionParent(await requestResult(complete.getAll()), projectId, expectedParentRevisionId);
      await requestResult(complete.add(record));
      await requestResult(pending.delete(revisionId));
    });
  }

  listComplete() {
    return this.transact('complete', 'readonly', transaction => requestResult(transaction.objectStore('complete').getAll()));
  }

  listPending() {
    return this.transact('pending', 'readonly', transaction => requestResult(transaction.objectStore('pending').getAll()));
  }

  async read(revisionId) {
    const record = await this.transact('complete', 'readonly',
      transaction => requestResult(transaction.objectStore('complete').get(revisionId)));
    return record ?? null;
  }

  removePending(revisionId) {
    return this.transact('pending', 'readwrite', transaction => requestResult(transaction.objectStore('pending').delete(revisionId)));
  }

  removeComplete(revisionId) {
    return this.transact('complete', 'readwrite', transaction => requestResult(transaction.objectStore('complete').delete(revisionId)));
  }
}
