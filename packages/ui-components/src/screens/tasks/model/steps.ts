// An attempt's steps as the person reads them: each with its reasoning, the small ones
// (quiet) folded together, and a heading only where the kind changes between steps taken from
// what was saved and steps worked out again. With no provenance nothing is marked.

import type { ChatAttemptProvenance } from "../../../chat/ports/index.ts";
import type { TaskStep } from "../port.ts";
import { clockWords } from "./clock-words.ts";

export const FROM_SAVED = "From saved steps";
export const WORKED_OUT = "Worked out again";

export type StepEntry = { stepId: string; time?: string; title: string; reason?: string; result?: string; heading?: string };

/** A step shown, or a run of quiet ones kept behind one control. */
export type StepRun = { kind: "step"; entry: StepEntry } | { kind: "quiet"; entries: StepEntry[] };

function kindOf(step: TaskStep, index: number, provenance: ChatAttemptProvenance | undefined): string | undefined {
  if (provenance === undefined) return undefined;
  const matched = provenance.steps.find((candidate) => candidate.label === step.title) ?? provenance.steps.find((candidate) => candidate.position === index + 1);
  if (matched === undefined || !matched.ran) return undefined;
  return matched.from === "saved" ? FROM_SAVED : WORKED_OUT;
}

/** `steps` in order as runs; headings are put on the first step of each kind. */
export function stepRuns(steps: readonly TaskStep[], provenance?: ChatAttemptProvenance): StepRun[] {
  const runs: StepRun[] = [];
  let lastKind: string | undefined;
  for (const [index, step] of steps.entries()) {
    const entry: StepEntry = { stepId: step.stepId, title: step.title };
    const time = clockWords(step.atMs);
    if (time !== undefined) entry.time = time;
    if (step.reason !== undefined && step.reason !== "") entry.reason = step.reason;
    if (step.result !== undefined && step.result !== "") entry.result = step.result;
    if (step.quiet === true) {
      const last = runs[runs.length - 1];
      if (last?.kind === "quiet") last.entries.push(entry);
      else runs.push({ kind: "quiet", entries: [entry] });
      continue;
    }
    const kind = kindOf(step, index, provenance);
    if (kind !== undefined && kind !== lastKind) entry.heading = kind;
    if (kind !== undefined) lastKind = kind;
    runs.push({ kind: "step", entry });
  }
  return runs;
}

/** What a folded run of quiet steps says: "2 small steps". */
export function quietWords(count: number): string {
  return count === 1 ? "1 small step" : `${count} small steps`;
}
