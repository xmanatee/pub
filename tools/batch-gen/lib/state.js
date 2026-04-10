import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";

const PHASES = [
  "pending",
  "designing",
  "designed",
  "implementing",
  "implemented",
  "publishing",
  "published",
  "testing",
  "tested",
  "reviewing",
  "reviewed",
];

export function loadState(stateFile) {
  if (!existsSync(stateFile)) return { ideas: [] };
  return JSON.parse(readFileSync(stateFile, "utf-8"));
}

export function saveState(stateFile, state) {
  const tmp = `${stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, stateFile);
}

export function setPhase(state, id, phase) {
  const idea = state.ideas.find((i) => i.id === id);
  if (idea) idea.phase = phase;
}

export function getPhase(state, id) {
  const idea = state.ideas.find((i) => i.id === id);
  return idea ? idea.phase : undefined;
}

export function idsInPhases(state, ...phases) {
  return state.ideas.filter((i) => phases.includes(i.phase)).map((i) => i.id);
}

export function countInPhase(state, phase) {
  return state.ideas.filter((i) => i.phase === phase).length;
}

export function countPastPhase(state, phase) {
  const idx = PHASES.indexOf(phase);
  if (idx === -1) return 0;
  const past = PHASES.slice(idx);
  return state.ideas.filter((i) => past.includes(i.phase)).length;
}

export { PHASES };
