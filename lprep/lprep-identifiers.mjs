const ID_PREFIXES = new Set([
  'project', 'session', 'machine', 'graph', 'instance', 'node', 'port', 'connection',
  'chain', 'compensation-group', 'assignment', 'reservation',
  'transaction', 'revision', 'replacement', 'preset', 'draft-chain'
]);

export function createStableId(kind) {
  if (!ID_PREFIXES.has(kind)) throw new TypeError(`Type d’identifiant L-Prep inconnu : ${kind}`);
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('crypto.randomUUID indisponible.');
  return `${kind}:${globalThis.crypto.randomUUID()}`;
}

export function isStableId(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

export function createSequentialIdFactory(prefix = 'test') {
  let sequence = 0;
  return kind => `${kind}:${prefix}:${++sequence}`;
}
