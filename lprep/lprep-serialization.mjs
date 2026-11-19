import { validateProject } from './lprep-project.mjs';
import { freezeEnvironmentSnapshot } from './lprep-environment.mjs';

export class LPrepValidationError extends Error {
  constructor(issues) {
    super(`Projet L-Prep invalide (${issues.filter(issue => issue.severity === 'error').length} erreur(s)).`);
    this.name = 'LPrepValidationError';
    this.issues = structuredClone(issues);
  }
}

const blocking = issues => issues.filter(issue => issue.severity === 'error');

export function serializeProject(project, { space = 2 } = {}) {
  const issues = validateProject(project);
  if (blocking(issues).length) throw new LPrepValidationError(issues);
  return `${JSON.stringify(project, null, space)}\n`;
}

export function deserializeProject(source) {
  if (typeof source !== 'string') throw new TypeError('Le projet sérialisé doit être une chaîne JSON.');
  let project;
  try { project = JSON.parse(source); }
  catch (error) { throw new SyntaxError(`JSON L-Prep invalide : ${error.message}`); }
  const issues = validateProject(project);
  if (blocking(issues).length) throw new LPrepValidationError(issues);
  for (const session of project.sessions || []) {
    if (session.environmentSnapshot) session.environmentSnapshot = freezeEnvironmentSnapshot(session.environmentSnapshot);
  }
  return project;
}
