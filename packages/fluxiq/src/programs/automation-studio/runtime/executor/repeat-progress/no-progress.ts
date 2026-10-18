// A do-while loop that goes round without getting anywhere ends as a failure,
// naming the loop and the pass it reached (lane 3, `run-mvcvzwk1-c1d869e4`).
//
// A Repeat (`builtin.control.repeat`, `../../../nodes/control-flow/repeat.ts`)
// bounds its passes by `most`, and nothing else stopped it: Lab run
// `run-mvcvzwk1-c1d869e4` (steps 0083 and 0085) repeated a list read and a
// step meant to move the list on, `repeat most: 40`, and the step moved
// nothing, so every pass read the same rows again. Each trial ran its forty
// passes for about 480 s, the build's time went on two of them, and the only
// guard against a run looping without progress
// (`../state-routing/progress-guard.ts`) counts every Repeat pass as progress
// by design, so it never looks inside one.
//
// So a pass is weighed when the next one would begin. A pass made progress
// when one of its steps stored a row no earlier step of this run stored, or
// when one of its steps changed what the host saw: its state diff
// (`stateRefs.stateDiff`, the host's own, `../host-state.ts`) moved to another
// document or location, or added or removed anything. Only positive evidence
// of standing still counts against a pass: the host traced a diff for at least
// one of its steps, and every step without one is Core's own and acts on
// nothing outside the run (a Merge, a wait, a variable). A step that acts
// outside the run with no diff traced says nothing either way, so its pass
// counts as progress; so does a pass of Core's own steps alone, and a host
// that traces no diffs is never stopped here.
//
// After `AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT` passes in a row of one
// loop made no progress, the Repeat's arrival for the next pass fails instead
// of starting it, with `repeat.no_progress`, and the run ends there
// (`../graph-run.ts`). The failure says which passes stood still and the pass
// it stopped before, in its `expected` and `actual`, which a trial's feedback
// carries to the builder beside the step (`../../service/candidate-trial/feedback.ts`).
// Three, as the state-route guard allows three returns without progress: a
// page slow to load what a pass asked for may stand still once or twice and
// then move on.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeSideEffectClass } from "../defensive/index.ts";

/** Passes in a row of one loop that made no progress, after which the loop ends as a failure (header). */
export const AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT = 3;

/** The code of a loop that ended because its passes made no progress (header). */
const NO_PROGRESS_CODE = "repeat.no_progress";
const REPEAT_DEFINITION_ID = "builtin.control.repeat";
const CORE_PREFIX = "builtin.";

/**
 * The Repeat's attempt as it stands when this loop made no progress for the
 * last `AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT` passes (header): failed,
 * with `repeat.no_progress` and what stood still. Undefined for any other
 * attempt, and for a loop that is getting somewhere.
 */
export function automationStudioRepeatNoProgress(input: {
  node: AutomationStudioFlowNode;
  /** The Repeat's attempt that would begin the next pass. */
  attempt: AutomationStudioNodeAttemptTrace;
  /** The frame's attempts before it, in the order they ran. */
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  nodesById: ReadonlyMap<string, AutomationStudioFlowNode>;
}): AutomationStudioNodeAttemptTrace | undefined {
  const { node, attempt, attempts, nodesById } = input;
  if (node.definitionId !== REPEAT_DEFINITION_ID || attempt.status !== "succeeded" || attempt.route !== "body") return undefined;
  const heads = passHeads(node.id, attempts);
  if (heads.length < AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT) return undefined;
  const stored = new Set<string>();
  attempts.slice(0, heads[0]).forEach((earlier) => storedRows(earlier).forEach((row) => stored.add(row)));
  let still = 0;
  heads.forEach((head, index) => {
    const pass = attempts.slice(head + 1, heads[index + 1] ?? attempts.length);
    const newRow = pass.some((step) => storedRows(step).some((row) => !stored.has(row)));
    pass.forEach((step) => storedRows(step).forEach((row) => stored.add(row)));
    still = newRow || !stoodStill(pass, nodesById) ? 0 : still + 1;
  });
  if (still < AUTOMATION_STUDIO_REPEAT_NO_PROGRESS_LIMIT) return undefined;
  const next = passNumber(attempt) ?? heads.length + 1;
  const first = next - still, last = next - 1;
  const passes = first === last ? `Pass ${first}` : `Passes ${first} to ${last}`;
  const actual = `${passes} of this repeat stored no new rows and left the page as it was, so the loop stopped before pass ${next} instead of doing the same again.`;
  return {
    ...attempt,
    status: "failed",
    route: "failed",
    outputs: { pass: next - 1 },
    message: `The loop made no progress: ${actual}`,
    failure: {
      category: "unexpected_state",
      code: NO_PROGRESS_CODE,
      retryable: false,
      stage: "execution",
      expected: "Each pass of a repeat stores rows no earlier pass stored, or changes the page, so the next pass reads something new.",
      actual
    }
  };
}

/** The attempts that began each pass of the node's current loop, oldest first: since its latest first pass, while every one began a pass. */
function passHeads(nodeId: string, attempts: readonly AutomationStudioNodeAttemptTrace[]): number[] {
  const heads: number[] = [];
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const earlier = attempts[index]!;
    if (earlier.nodeId !== nodeId) continue;
    // A loop that ended (its bound reached, or a failure) began the passes before it in another round of the loop.
    if (earlier.status !== "succeeded" || earlier.route !== "body") break;
    heads.unshift(index);
    if (passNumber(earlier) === 1) break;
  }
  return heads;
}

function passNumber(attempt: AutomationStudioNodeAttemptTrace): number | undefined {
  const pass = attempt.outputs.pass;
  return typeof pass === "number" && Number.isSafeInteger(pass) && pass >= 1 ? pass : undefined;
}

/** The rows a step stored (`outputs.records`, `../record-capture.ts`), each in one canonical form, so the same row stored again is the same text. */
function storedRows(attempt: AutomationStudioNodeAttemptTrace): string[] {
  const records = attempt.status === "succeeded" ? attempt.outputs.records : undefined;
  return Array.isArray(records) ? records.map(canonical) : [];
}

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key] as JsonValue)}`).join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Whether the host saw the pass leave everything as it was (header): at least
 * one of its steps has a state diff, none of those moved, added or removed
 * anything, and every step without one is Core's own and acts on nothing
 * outside the run. A pass with no diff at all -- Core's own steps alone, or a
 * host that traces none -- is never said to stand still.
 */
function stoodStill(pass: readonly AutomationStudioNodeAttemptTrace[], nodesById: ReadonlyMap<string, AutomationStudioFlowNode>): boolean {
  let observed = false;
  for (const step of pass) {
    const diff = step.stateRefs?.stateDiff;
    if (!diff) {
      const node = nodesById.get(step.nodeId);
      if (!(step.definitionId.startsWith(CORE_PREFIX) && node !== undefined && automationStudioNodeSideEffectClass(node) === "none")) return false;
      continue;
    }
    const documentMoved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
    if (documentMoved || written(diff.added) || written(diff.removed) || counted(diff.addedCount) || counted(diff.removedCount)) return false;
    observed = true;
  }
  return observed;
}

function written(value: JsonValue | undefined): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return Array.isArray(value) && value.length > 0;
}

function counted(value: JsonValue | undefined): boolean {
  return typeof value === "number" && value > 0;
}
