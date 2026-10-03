// A repeated step's passes, as the judge of a build's test is shown them
// (t252 D6).
//
// **Why.** A span that repeats over a list read's rows now runs once per row in
// the test (`llm/node-tools/replay-draft.ts`). Its outcome carries `passes`
// (`{pass, status, resultCode?}`) and each observation the pass (`pass`, 1-based)
// and the count (`of`). Sent as one list of answers under the step, the judge
// could not tell which row a pass acted on, and would read a second pass on
// another row as the step doing something other than what the build explored.
//
// **What a pass line is.** The pass number, the row's label, the pass's own
// outcome word, and what the test observed on it by the very rule a step's
// observation follows (a read's rows, a check's answer, nothing for a change run
// again). The label is the one the list read's `readRows` named that row by,
// already screened by `./read-rows.ts`: a row's values never travel here, and a
// label from a denied column or shaped like a credential is said as withheld.
// A pass whose list named no label for it (a while span, rows not shown, or a
// read whose rows were not sent) carries its number only.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftReplayOutcomeWord,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftReplayStatus,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import type { AutomationStudioBuildTestPass, AutomationStudioBuildTestStep } from "../contracts.ts";
import type { AutomationStudioBuildTestObservationReader } from "./observation.ts";

/** One pass of a span member's outcome, as the walker writes it. Declared here so this reads it before the walker's type lands. */
type PassOutcome = { pass: number; status: AutomationStudioFlowDraftReplayStatus; resultCode?: string };

/** One observation of the step, with its pass when it came from a repeated span. */
type StepObservation = { pass?: number | undefined; evidence: JsonValue };

/**
 * The step's pass lines, the observations that belong to no pass (sent as the
 * step's own `observed`), and whether a pass's observation was withheld. No
 * pass anywhere, no lines: a step outside a repeated span reads as before.
 */
export function automationStudioBuildTestPassLines(input: {
  step: AutomationStudioFlowDraftStep;
  outcome: AutomationStudioFlowDraftReplayOutcome | undefined;
  observations: readonly StepObservation[];
  /** The screened labels of the rows the span repeats over, in order. */
  rows: readonly string[] | undefined;
  /** The step's observation reader, absent when no observation of the domain's may be carried, or none is shown for this step. */
  observe: ((evidence: readonly JsonValue[]) => ReturnType<AutomationStudioBuildTestObservationReader>) | undefined;
  /** The step's own outcome word, for a pass that observed something but has no answer of its own. */
  stepOutcome: AutomationStudioBuildTestStep["outcome"];
}): { passes?: AutomationStudioBuildTestPass[]; unpassed: JsonValue[]; withheld: boolean } {
  const answered = passOutcomes(input.outcome);
  const numbers = [...new Set([...answered.keys(), ...input.observations.flatMap((item) => passNumber(item.pass) ?? [])])].sort((a, b) => a - b);
  const unpassed = input.observations.filter((item) => passNumber(item.pass) === undefined).map((item) => item.evidence);
  if (!numbers.length) return { unpassed, withheld: false };
  let withheld = false;
  const passes = numbers.map((pass): AutomationStudioBuildTestPass => {
    const answer = answered.get(pass);
    const evidence = input.observations.filter((item) => passNumber(item.pass) === pass).map((item) => item.evidence);
    const observed = input.observe && evidence.length ? input.observe(evidence) : undefined;
    if (observed?.withheld) withheld = true;
    const row = input.rows?.[pass - 1];
    return {
      pass,
      ...(row !== undefined ? { row } : {}),
      outcome: answer ? passWord(input.step, input.outcome, answer) : input.stepOutcome,
      ...(observed?.value !== undefined ? { observed: observed.value } : {})
    };
  });
  return { passes, unpassed, withheld };
}

/** The outcome's passes by number; anything not that shape is left out. */
function passOutcomes(outcome: AutomationStudioFlowDraftReplayOutcome | undefined): Map<number, PassOutcome> {
  const sent = (outcome as { passes?: unknown } | undefined)?.passes;
  const byNumber = new Map<number, PassOutcome>();
  if (!Array.isArray(sent)) return byNumber;
  for (const item of sent) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const pass = passNumber(record.pass);
    if (pass === undefined || typeof record.status !== "string" || byNumber.has(pass)) continue;
    byNumber.set(pass, {
      pass,
      status: record.status as AutomationStudioFlowDraftReplayStatus,
      ...(typeof record.resultCode === "string" ? { resultCode: record.resultCode } : {})
    });
  }
  return byNumber;
}

/** A pass's word, read as the step's own would be: the step's mode, the pass's status and code. */
function passWord(step: AutomationStudioFlowDraftStep, outcome: AutomationStudioFlowDraftReplayOutcome | undefined, answer: PassOutcome): AutomationStudioBuildTestStep["outcome"] {
  const word = automationStudioFlowDraftReplayOutcomeWord({
    step: step.position,
    actionId: step.actionId,
    status: answer.status,
    ...(answer.resultCode !== undefined ? { resultCode: answer.resultCode } : {}),
    ...(outcome?.mode ? { mode: outcome.mode } : {})
  });
  return PASS_WORDS.has(word) ? word as AutomationStudioBuildTestStep["outcome"] : "failed";
}

const PASS_WORDS: ReadonlySet<string> = new Set(["replayed", "verified", "present", "remembered", "failed", "changed", "unreproducible"]);

function passNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}
