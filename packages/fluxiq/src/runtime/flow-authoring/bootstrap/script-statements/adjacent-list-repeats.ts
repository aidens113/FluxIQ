// One span per listing: steps written one after another that each say `repeat
// over:` the same listing are one span over it (t567).
//
// A listing's rows leave it on one port, and that port takes one connection
// (`../plan/validation.ts`, `bootstrap.source_port_cardinality`), so a block
// holds at most one loop over each listing. A builder that wrote two adjacent
// steps each saying `repeat over: <the listing>` -- open the row, then act on
// it -- meant one pass per row doing both, and was refused four times with
// "Source port does not allow multiple connections", which says nothing it can
// act on (`run-mvcwqwec-0aa4f98b`, 0081-0160). No script that builds today
// says that, so reading it as one span changes the meaning of none.
//
// So a span over a listing -- its first step's `repeat over:`, through its
// `repeat through:` or that step alone -- takes in the step written right
// after it when that step also says `repeat over:` the same listing and no
// `repeat while:`; that step's own `repeat through:`, if it names a step at or
// after it, moves the span's end on. A step inside the span that repeats over
// the same listing is the same statement and is absorbed too. The span's first
// step then says `repeat through:` its new last step, which is given the label
// the repeat router gives every unlabelled step (`../authoring/draft-routing.ts`)
// when it has none, so every later reader sees one span. A member keeps a
// `repeat pace:` or `repeat most:` it also wrote; those are statements about
// the span it now stands in, moved or refused by `./repeat-pace.ts` and
// `./repeat-bound.ts`.
//
// A second span over a listing that is not written right after the first is
// refused at its `repeat over:` line, with what to write instead, and its
// repeat lines are taken off, so that refusal is the only one it gets. A step
// that says `repeat over:` beside `repeat while:`, or a span whose end names no
// step at or after it, is left as written for the router's own refusal.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** The code a second span over one listing is refused under. */
const OVER_TWICE = "flow_script.repeat_over_twice";
/** The label prefix the repeat router derives for a step written with none; no written label can hold a colon (`../authoring/parse.ts`). */
const DERIVED_LABEL = ":line";

/**
 * The script's blocks with every run of adjacent spans over one listing made
 * one span, and each later span over a listing its block already walks
 * refused. A block with fewer than two `repeat over:` lines comes back as it
 * was, the same object; spans never cross a block, so each is read alone.
 */
export function automationStudioFlowScriptAdjacentListRepeats(blocks: readonly AutomationStudioFlowScriptBlock[]): {
  blocks: AutomationStudioFlowScriptBlock[];
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  return {
    blocks: blocks.map((block) => block.steps.filter((step) => step.repeat?.over !== undefined).length < 2 ? block : { ...block, steps: oneSpanPerListing(block.steps, issues) }),
    issues
  };
}

/** One block's steps read as the header says, each refusal added to `issues`. */
function oneSpanPerListing(steps: readonly AutomationStudioFlowScriptStep[], issues: AutomationStudioFlowBootstrapIssue[]): AutomationStudioFlowScriptStep[] {
  const out = steps.map((step) => step.repeat ? { ...step, repeat: { ...step.repeat } } : step);
  const indexOf = new Map<string, number>();
  for (const [index, step] of out.entries()) if (step.label !== undefined && !indexOf.has(step.label)) indexOf.set(step.label, index);
  /** The first step of the span over each listing, by the listing's label. */
  const walked = new Map<string, number>();
  for (const [head, step] of out.entries()) {
    const repeat = step.repeat;
    if (!opensSpanOver(step)) continue;
    const list = repeat!.over!;
    const first = walked.get(list);
    if (first !== undefined) {
      issues.push(scriptStatementRefusal(OVER_TWICE, `The step at line ${step.line} repeats over "${list}", and the span that starts at line ${out[first]!.line} already repeats over it, with other steps between the two. A listing is repeated over once: write every step of each pass in one span, \`repeat over: ${list}\` on its first step and \`repeat through: <its last step>\`.`, repeat!.line));
      delete step.repeat;
      continue;
    }
    walked.set(list, head);
    const written = spanEnd(out, head, indexOf);
    if (written === undefined) continue;
    let end = written;
    for (let next = head + 1; next <= end + 1 && next < out.length; next += 1) {
      const member = out[next]!;
      if (!opensSpanOver(member) || member.repeat!.over !== list) continue;
      const memberEnd = spanEnd(out, next, indexOf);
      if (memberEnd === undefined) break;
      end = Math.max(end, memberEnd);
      const rest = { ...member.repeat! };
      delete rest.over;
      delete rest.through;
      if (rest.most === undefined && rest.pace === undefined) delete member.repeat;
      else member.repeat = rest;
    }
    if (end === written) continue;
    const last = out[end]!;
    const label = last.label ?? `${DERIVED_LABEL}${last.line}`;
    if (last.label === undefined) {
      // A copy: a step with no repeat line is the caller's own object.
      out[end] = { ...last, label };
      indexOf.set(label, end);
    }
    repeat!.through = label;
  }
  return out;
}

/** Whether a step starts a span over a listing: it says `repeat over:` and no `repeat while:`. */
function opensSpanOver(step: AutomationStudioFlowScriptStep): boolean {
  return step.repeat?.over !== undefined && step.repeat.while === undefined;
}

/** The index of the last step of the span `head` starts, or `undefined` when its `repeat through:` names no step at or after it. */
function spanEnd(steps: readonly AutomationStudioFlowScriptStep[], head: number, indexOf: ReadonlyMap<string, number>): number | undefined {
  const through = steps[head]!.repeat?.through;
  if (through === undefined) return head;
  const end = indexOf.get(through);
  return end !== undefined && end >= head ? end : undefined;
}
