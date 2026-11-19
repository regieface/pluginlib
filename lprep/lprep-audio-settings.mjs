export const MACHINE_SAMPLE_RATES = [48000, 96000];

export function projectMachines(project) {
  const machines = new Map();
  for (const ref of Array.isArray(project?.metadata?.targetMachines) ? project.metadata.targetMachines : []) {
    if (ref?.machineId && ref.fallback?.name) machines.set(ref.machineId, ref);
  }
  for (const session of project?.sessions || []) {
    const ref = session.targetMachineRef;
    if (ref && !machines.has(ref.machineId)) machines.set(ref.machineId, ref);
  }
  return [...machines.values()];
}

export function machineSampleRates(ref) {
  const rates = ref?.fallback?.supportedSampleRates;
  return Array.isArray(rates) ? [...new Set(rates.filter(rate => Number.isSafeInteger(rate) && rate > 0))].sort((a, b) => a - b) : [];
}

export function setSessionMachine(project, session, machineId, definition, idFactory) {
  const machines = new Map(projectMachines(project).map(value => [value.machineId, value]));
  let ref = machines.get(machineId);
  if (definition) {
    const name = definition.name.trim();
    const rates = definition.rates;
    if (!name || !Array.isArray(rates) || rates.some(rate => !Number.isSafeInteger(rate) || rate <= 0)) {
      throw new Error('Nom et fréquences déclarées invalides.');
    }
    if (machineId && !ref) throw new Error('Machine introuvable.');
    ref = { ...ref, machineId: ref?.machineId || idFactory('machine'),
      fallback: { ...ref?.fallback, name, supportedSampleRates: [...new Set(rates)] } };
    for (const item of project.sessions) {
      if (item.targetMachineRef?.machineId !== ref.machineId) continue;
      const current = item.audioGraph.sampleRate;
      if (rates.length && current !== null && !rates.includes(current)) {
        throw new Error(`La fréquence de « ${item.name} » ne figure pas dans les fréquences déclarées.`);
      }
      item.targetMachineRef = structuredClone(ref);
    }
    machines.set(ref.machineId, ref);
  } else if (machineId && !ref) throw new Error('Machine introuvable.');
  const rates = machineSampleRates(ref);
  const current = session.audioGraph.sampleRate;
  if (rates.length && current !== null && !rates.includes(current)) {
    throw new Error('La fréquence actuelle est incompatible avec les fréquences déclarées pour cette machine. Modifiez-la explicitement avant de changer de cible.');
  }
  session.targetMachineRef = ref ? structuredClone(ref) : null;
  project.metadata = { ...project.metadata, targetMachines: structuredClone([...machines.values()]) };
}

export function setSessionSampleRate(project, session, rate) {
  if (rate === session.audioGraph.sampleRate) return;
  const machine = projectMachines(project).find(ref => ref.machineId === session.targetMachineRef?.machineId);
  if (rate !== null && !machineSampleRates(machine).includes(rate)) {
    throw new Error('Cette fréquence n’est pas déclarée pour la machine cible.');
  }
  session.audioGraph.sampleRate = rate;
}
