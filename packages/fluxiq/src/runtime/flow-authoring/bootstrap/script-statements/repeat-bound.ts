// Which span a written `repeat most:` bounds.
//
// The parser puts a `repeat most:` line on the step it is written under
// (`../authoring/parse.ts`), and the router reads it only on the step that starts a
// span (`../authoring/draft-routing.ts`). A model that writes the bound under the
// span's last step -- beside the check whose success repeats the span, which is
// where it reads naturally -- was refused for saying repeat inside a repeat:
// lane C (`run-mv0fuotv-805294d7`, 0036) wrote `repeat while: next` on the
// listing and `repeat most: 10` under `next`, and that refusal is all it got.
//
// Spans do not nest (a repeat inside a repeat is refused), so a `repeat most:`
// under any step of a `repeat while` span can bound only that span, and it is
// read as the span's own. It is refused only where it cannot mean that: under
// a step no span takes in, or beside a different bound the span's first step
// already gives. Each refusal names the `repeat most:` line itself.
//
// The same holds for a `repeat over` span (F5), where the bound takes only the
// listing's first rows (For Each's `stopAfter`, `../authoring/draft-routing.ts`).
// Photo r1 (`run-mvecxeci-1c2cc227`) wrote `repeat over: posts` and `repeat
// most: 3` under each of three adjacent steps; `./adjacent-list-repeats.ts`
// made them one span and left each member its bound, and two of the three
// were refused as bounding nothing. A bound equal to the one the span already
// has says nothing new, so it is taken as that bound, on either kind of span.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** The code both refusals are made under; its sentence is Core's own and quotes only lines. */
const MISPLACED = "flow_script.repeat_most_misplaced";

/**
 * One block's steps with every `repeat most:` written under a member of a
 * `repeat while` or `repeat over` span moved onto the step that starts the
 * span (or dropped, when it repeats that step's own bound), or the issues
 * that refused one. A block with no such line comes back as it was, the same
 * array.
 */
export function automationStudioFlowScriptRepeatBounds(steps: readonly AutomationStudioFlowScriptStep[]): {
  steps: readonly AutomationStudioFlowScriptStep[];
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const loose = steps.flatMap((step, index) => boundOnly(step) ? [index] : []);
  if (!loose.length) return { steps, issues: [] };
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const out = steps.map((step) => step.repeat ? { ...step, repeat: { ...step.repeat } } : step);
  const spans = repeatSpans(out);
  for (const index of loose) {
    const member = out[index]!;
    const bound = member.repeat!;
    const mostLine = bound.mostLine ?? bound.line;
    const span = spans.find((candidate) => index > candidate.head && index <= candidate.end);
    // The bound is taken off the member whatever becomes of it, so its own
    // refusal is the only one it gets: left on, the router would refuse the
    // span again for a repeat inside it.
    delete member.repeat;
    if (!span) {
      issues.push(scriptStatementRefusal(MISPLACED, `The \`repeat most:\` at line ${mostLine} is under the step at line ${member.line}, which no \`repeat while\` or \`repeat over\` span takes in, so it bounds nothing. Write it beside the \`repeat while:\` or \`repeat over:\` line of the span it should bound, or take it out.`, mostLine));
      continue;
    }
    const head = out[span.head]!;
    const headRepeat = head.repeat!;
    if (headRepeat.most !== undefined && sameBound(headRepeat.most, bound.most!)) continue;
    if (headRepeat.most !== undefined) {
      issues.push(scriptStatementRefusal(MISPLACED, `The \`repeat most:\` at line ${mostLine} bounds the span that starts at line ${head.line}, which already says \`repeat most:\` at line ${headRepeat.mostLine ?? headRepeat.line}. A span takes one bound: keep one of the two, beside \`repeat while:\`.`, mostLine));
      continue;
    }
    headRepeat.most = bound.most!;
    headRepeat.mostLine = mostLine;
  }
  return { steps: out, issues };
}

/** A step whose only `repeat` line is `repeat most:`: a bound written away from its span's first step. */
function boundOnly(step: AutomationStudioFlowScriptStep): boolean {
  const repeat = step.repeat;
  return repeat !== undefined && repeat.most !== undefined && repeat.over === undefined && repeat.while === undefined && repeat.through === undefined;
}

/** Whether two written bounds are the same whole number, as the router will read them. */
function sameBound(left: string, right: string): boolean {
  return left.trim() !== "" && Number(left.trim()) === Number(right.trim());
}

/**
 * Each `repeat while` span, and each `repeat over` span (through its `repeat
 * through:` step), by its first and last step's index, as the router reads it
 * (`../authoring/draft-routing.ts`, `scriptSpan`). A span of one step has no
 * member to carry a loose bound, so only longer spans are listed.
 */
function repeatSpans(steps: readonly AutomationStudioFlowScriptStep[]): { head: number; end: number }[] {
  const indexOf = new Map<string, number>();
  for (const [index, step] of steps.entries()) if (step.label !== undefined && !indexOf.has(step.label)) indexOf.set(step.label, index);
  return steps.flatMap((step, head) => {
    const repeat = step.repeat;
    if (repeat === undefined || (repeat.while !== undefined) === (repeat.over !== undefined)) return [];
    const ends = repeat.while ?? repeat.through;
    const end = ends === undefined ? undefined : indexOf.get(ends);
    return end !== undefined && end > head ? [{ head, end }] : [];
  });
}
