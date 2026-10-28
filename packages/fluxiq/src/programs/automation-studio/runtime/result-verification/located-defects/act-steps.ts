import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

/**
 * One step of Core's record of what a run or a build's test did, as an act
 * defect is looked for in it (`./act-located.ts`, t766): the names the evidence
 * calls it by, every word Core holds of it, and whether it reads rows rather
 * than acts.
 */
export type AutomationStudioResultActStep = {
  /** Its node id and label, or a build test's step number: what a defect's `step` may name it by. */
  names: string[];
  /** Its label, action, target, authored parameters' text and the changes the run saw it make. */
  words: string[];
  /** A step that reads rows: a defect of what it read is a row defect, never an act's. */
  reads: boolean;
};

type ActSummary = Pick<AutomationStudioRunResultSummary, "flowShape" | "buildTest" | "reads" | "recordSets">;

/**
 * The steps of Core's record of the judged result (header): each step of the
 * Flow (`flowShape`, with what this run saw it change), and, for a build's
 * test, each step the test ran by its number, with its target and what it
 * observed. Read from the summary the judges were sent, never from a model's
 * words.
 */
export function automationStudioResultActSteps(summary: ActSummary): AutomationStudioResultActStep[] {
  const readNodes = new Set([
    ...(summary.reads ?? []).map((read) => read.nodeId),
    ...summary.recordSets.flatMap((set) => (set.processing?.passes ?? []).map((pass) => pass.node))
  ]);
  const storing = new Set((summary.buildTest?.stores ?? []).flatMap((store) => store.steps));
  const flow = summary.flowShape.map((step): AutomationStudioResultActStep => ({
    names: [step.nodeId, ...(step.label ? [step.label] : [])],
    words: [
      ...(step.label ? [step.label] : []), step.definitionId, ...texts(step.parameters),
      ...(step.changed ?? []).flatMap((change) => [change.added, change.removed].filter((line): line is string => typeof line === "string"))
    ],
    reads: readNodes.has(step.nodeId)
  }));
  const tested = (summary.buildTest?.steps ?? []).map((step): AutomationStudioResultActStep => ({
    names: [String(step.step), `step ${step.step}`],
    words: [step.action, ...(step.target ?? [])],
    reads: storing.has(step.step) || readsRows(step.observed)
  }));
  return [...flow, ...tested];
}

/** Whether a build test's observation is the rows a read returned. */
function readsRows(observed: JsonValue | undefined): boolean {
  return typeof observed === "object" && observed !== null && !Array.isArray(observed) && (observed.readRows !== undefined || Array.isArray(observed.rows));
}

/** Every string a JSON value holds, its keys left out. */
function texts(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (typeof value === "object" && value !== null) return Object.values(value).flatMap(texts);
  return [];
}
