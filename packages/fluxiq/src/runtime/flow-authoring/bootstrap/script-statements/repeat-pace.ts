// How fast a written span may go round: `repeat pace: <time>` (t378).
//
// A site that asks a run to slow down says so on a pass, and the next passes
// meet the same notice unless they start further apart (lane D,
// `run-mv0fuual-f9e6f089`: the seventh confirm in a row was refused). The
// runtime keeps a node's pace -- the least time between two of its starts in
// one run -- from the Flow node's `metadata.paceMs`
// (`../../executor/pacing/pace-metadata.ts`). This reads the line a model
// writes for it onto the span's first step, as `paceMs`, which the assembler
// writes on the plan node (`../authoring/assemble.ts`) and the adaptation on the Flow
// node (`../adaptation.ts`). The first step starts every pass, so its pace
// is the pace between passes.
//
// The time is `<number> ms`, `s`, `seconds`, `min` or `minutes`; a bare number
// is seconds, as a person says "pace: 6". Like `repeat most:`
// (`./repeat-bound.ts`), a pace written under another step of a span is the
// span's own, so it is moved to the span's first step; it is refused only
// where no span takes it in, where the span already has one, or where the time
// cannot be read. Each refusal names the `repeat pace:` line.
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS, type AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";
import { automationStudioFlowScriptSpans } from "./script-spans.ts";

/** A time as a person writes one: a number, then a unit or none. */
const TIME = /^(\d+(?:\.\d+)?)\s*([a-z]*)\.?$/u;
/** Milliseconds per unit, by every spelling read; no unit is seconds. */
const UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1, msec: 1, msecs: 1, millisecond: 1, milliseconds: 1,
  "": 1_000, s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
  min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000
};
const { minPaceMs, maxPaceMs } = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS;

/**
 * One block's steps with each `repeat pace:` read onto the first step of the
 * span it paces, as `paceMs`, and taken off the repeat lines; or the issues that
 * refused one. A block with no such line comes back as it was, the same array.
 */
export function automationStudioFlowScriptRepeatPaces(steps: readonly AutomationStudioFlowScriptStep[]): {
  steps: readonly AutomationStudioFlowScriptStep[];
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const paced = steps.flatMap((step, index) => step.repeat?.pace !== undefined ? [index] : []);
  if (!paced.length) return { steps, issues: [] };
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const spans = automationStudioFlowScriptSpans(steps);
  const out = steps.map((step) => step.repeat ? { ...step, repeat: { ...step.repeat } } : step);
  // The span's own line first, so a second one under a member is the one refused.
  const ordered = [...paced].sort((left, right) => Number(spans[right]?.head === right) - Number(spans[left]?.head === left) || left - right);
  for (const index of ordered) {
    const step = out[index]!;
    const repeat = step.repeat!;
    const text = repeat.pace!;
    const line = repeat.paceLine ?? repeat.line;
    delete repeat.pace;
    delete repeat.paceLine;
    const head = spans[index]?.head;
    // A pace is taken off the step it is written under whatever becomes of it,
    // so its own refusal is the only one it gets: a repeat left with no line
    // that says what repeats it would be refused again by the router.
    if (head !== index && repeat.over === undefined && repeat.while === undefined && repeat.through === undefined && repeat.most === undefined) delete step.repeat;
    if (head === undefined) {
      issues.push(scriptStatementRefusal("flow_script.repeat_pace_misplaced", `The \`repeat pace:\` at line ${line} is under the step at line ${step.line}, which no repeat span takes in, so it paces nothing. Write it beside the \`repeat over:\` or \`repeat while:\` line of the span it should pace, or take it out.`, line));
      continue;
    }
    const first = out[head]!;
    if (first.paceMs !== undefined) {
      issues.push(scriptStatementRefusal("flow_script.repeat_pace_misplaced", `The \`repeat pace:\` at line ${line} paces the span that starts at line ${first.line}, which already says \`repeat pace:\`. A span takes one pace: keep one of the two, beside \`repeat over:\` or \`repeat while:\`.`, line));
      continue;
    }
    const paceMs = automationStudioPaceMs(text);
    if (paceMs === undefined) {
      issues.push(scriptStatementRefusal("flow_script.repeat_pace_invalid", `The \`repeat pace:\` at line ${line} says ${JSON.stringify(text.slice(0, 40))}. A pace is the least time between two passes: a number and ms, s or min, such as \`repeat pace: 6 s\`, from ${minPaceMs} ms to ${maxPaceMs / 60_000} min; a bare number is seconds.`, line));
      continue;
    }
    out[head] = { ...first, paceMs };
  }
  return { steps: out, issues };
}

/** A written time in whole milliseconds within the plan's bound, or `undefined` when it is not one. */
function automationStudioPaceMs(text: string): number | undefined {
  const match = TIME.exec(text.trim().toLowerCase());
  const perUnit = match ? UNIT_MS[match[2] ?? ""] : undefined;
  if (!match || perUnit === undefined) return undefined;
  const paceMs = Math.round(Number(match[1]) * perUnit);
  return Number.isSafeInteger(paceMs) && paceMs >= minPaceMs && paceMs <= maxPaceMs ? paceMs : undefined;
}
