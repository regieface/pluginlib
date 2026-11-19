import { L_PREP_SCHEMA_VERSION, validateProject } from './lprep-project.mjs';

export function migrateProject(source, { targetVersion = L_PREP_SCHEMA_VERSION } = {}) {
  const original = structuredClone(source);
  const sourceVersion = original?.schemaVersion;
  if (!Number.isInteger(sourceVersion)) return { status: 'error', diagnostics: [{ code: 'migration.source-version' }] };
  if (sourceVersion > L_PREP_SCHEMA_VERSION || targetVersion > L_PREP_SCHEMA_VERSION) return { status: 'unsupported', diagnostics: [{ code: 'migration.future-version' }] };
  if (targetVersion < sourceVersion) return { status: 'unsupported', diagnostics: [{ code: 'migration.downgrade' }] };
  const candidate = structuredClone(original);
  if (sourceVersion === 1 && targetVersion === 1) {
    for (const session of candidate.sessions || []) if (!Object.hasOwn(session, 'temporaryReplacements')) session.temporaryReplacements = [];
  }
  const diagnostics = validateProject(candidate).filter(value => value.severity === 'error');
  return diagnostics.length ? { status: 'invalid', sourceVersion, targetVersion, diagnostics } :
    { status: 'migrated', sourceVersion, targetVersion, project: candidate, diagnostics: [] };
}
