import { L_PREP_SCHEMA_VERSION, validateProject } from './lprep-project.mjs';
import { legacyChainFormats } from './lprep-audio-graph.mjs';

export function migrateProject(source, { targetVersion = L_PREP_SCHEMA_VERSION } = {}) {
  const original = structuredClone(source);
  const sourceVersion = original?.schemaVersion;
  if (!Number.isInteger(sourceVersion)) return { status: 'error', diagnostics: [{ code: 'migration.source-version' }] };
  if (sourceVersion > L_PREP_SCHEMA_VERSION || targetVersion > L_PREP_SCHEMA_VERSION) return { status: 'unsupported', diagnostics: [{ code: 'migration.future-version' }] };
  if (targetVersion < sourceVersion) return { status: 'unsupported', diagnostics: [{ code: 'migration.downgrade' }] };
  const candidate = structuredClone(original);
  for (const session of candidate.sessions || []) if (!Object.hasOwn(session, 'temporaryReplacements')) session.temporaryReplacements = [];
  if (sourceVersion === 1) {
    if (targetVersion >= 2) {
      for (const session of candidate.sessions || []) for (const chain of session.chains || []) {
        if (!Object.hasOwn(chain, 'audioFormat')) continue;
        let formats;
        try { formats = legacyChainFormats(chain.audioFormat); }
        catch {
          return { status: 'invalid', sourceVersion, targetVersion, diagnostics: [{
            code: 'migration.chain-format-ambiguous', chainId: chain.chainId, audioFormat: chain.audioFormat
          }] };
        }
        Object.assign(chain, formats);
        delete chain.audioFormat;
      }
      candidate.schemaVersion = 2;
    }
  }
  const diagnostics = validateProject(candidate).filter(value => value.severity === 'error');
  return diagnostics.length ? { status: 'invalid', sourceVersion, targetVersion, diagnostics } :
    { status: 'migrated', sourceVersion, targetVersion, project: candidate, diagnostics: [] };
}
