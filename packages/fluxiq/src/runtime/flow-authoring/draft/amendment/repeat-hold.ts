// A decision never leaves a repeat that assembly would refuse (t981).
//
// **The failures this closes.** Assembly routes only the steps in the Flow, and
// refuses a repeat whose `over` or `through` is not one of them
// (`flow_draft.repeat_span_unknown`), or whose span holds another step that
// says when it runs (`flow_draft.repeat_body_is_routed`)
// (`../../bootstrap/authoring/draft-routing.ts`). The amendments that broke
// each loop were answered "applied", and the build met the refusal only at
// save, after the attempt had answered, so the attempt saved no Flow:
//
//   - `run-mwp1jqze-388b466c` (0113) marked exploratory the listing a kept
//     press repeated over: `repeat_span_unknown` at save. The same in
//     `run-mwovqznu-0cbc3b10` (0320, 0326), which dropped a span's listing and
//     then its last step.
//   - `run-mwp0jueg-d06b5886` (0039) wrote a repeat on a step and another
//     whose span held it; 0041 wrote a repeat on a step inside another's span:
//     `repeat_body_is_routed` at save.
//
// **The rules, read once the decision's last amendment is done**:
//
//   - a `drop` of a step a repeat still in the Flow names as
//     its `over`, or as the last step of its span, is put back and refused
//     `holds_a_repeat`, naming the repeat. A decision that also takes that
//     repeat off, or takes out the step carrying it, takes the loop out whole
//     and is not refused. The step carrying the repeat may leave on its own:
//     its routing then names nothing the Flow runs.
//   - routing this decision wrote that leaves a span holding a second step that
//     says when it runs -- a repeat written over a routed step, or routing
//     written on a step inside a span -- is taken back and refused
//     `span_holds_routing`. When both were written, take back the outer
//     repeat; otherwise take back the new inner routing. A repeat over the same list inside, or
//     right after, a span over that list is part of that span, as assembly
//     makes it (`effectiveSteps`), and is no second statement.
//
// **Newly only.** A span already broken before the decision is not refused
// again here, so a draft that stood so never starts refusing amendments about
// other steps: assembly still says it at completion.
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftStepAnsweredInterruption } from "../interruption.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import {
  automationStudioFlowDraftRepeatIsWhile,
  automationStudioFlowDraftRoutingReferences,
  automationStudioFlowDraftStepId,
  type AutomationStudioFlowDraftStepRouting
} from "../routing.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering.ts";
import type { AutomationStudioFlowDraftWithdrawal } from "./strand-check.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./types.ts";

type Step = AutomationStudioFlowDraftStep;

/**
 * A `keep` that puts a step in the Flow, checked on a prospective draft before
 * it changes the real one. Refuse a newly routed body without deleting either
 * statement or losing the step's settings, act claims or disposition.
 */
export function automationStudioFlowDraftSpanChangeRefusal(
  steps: readonly Step[],
  step: Step,
  amendment: AutomationStudioFlowDraftAmendment,
  shown: AutomationStudioFlowDraftShownNumbering,
  change: { clearsRouting?: boolean; act?: string | undefined }
): AutomationStudioFlowDraftAmendmentRefusal | undefined {
  const projected = steps.map((entry) => ({ ...entry, id: automationStudioFlowDraftStepId(entry) }));
  const originals = new Map<Step, Step>(projected.map((entry, index) => [entry, steps[index]!]));
  const candidate = projected[steps.indexOf(step)]!;
  candidate.disposition = "kept";
  if (change.clearsRouting) delete candidate.routing;
  if (change.act !== undefined) candidate.acts = [...(candidate.acts ?? []), change.act];
  automationStudioFlowDraftKeepOpeners(projected, candidate);
  const key = (span: { head: Step; routed: Step }): string => JSON.stringify([automationStudioFlowDraftStepId(span.head), automationStudioFlowDraftStepId(span.routed)]);
  const before = new Set(spanConflicts(steps).map(key));
  const conflict = spanConflicts(projected).find((span) => !before.has(key(span)));
  if (!conflict) return undefined;
  const original = (entry: Step): Step => originals.get(entry)!;
  return { step: amendment.step, reason: "span_holds_routing", repeat: shown.number(original(conflict.head)), through: shown.number(original(conflict.through)), routed: shown.number(original(conflict.routed)) };
}

/** Routing one amendment of the decision wrote, with what the step said before it. */
export type AutomationStudioFlowDraftWrittenRouting = {
  step: Step;
  routing: AutomationStudioFlowDraftStepRouting;
  amendment: AutomationStudioFlowDraftAmendment;
  previous: AutomationStudioFlowDraftStepRouting | undefined;
  settings: JsonObject | undefined;
};

/**
 * Puts back each withdrawal of the decision that a repeat still in the Flow
 * names as its `over` or its span's last step, and refuses it
 * `holds_a_repeat`. Answers the refusals and how many applied amendments they
 * take back.
 */
export function automationStudioFlowDraftHoldRepeatSteps(
  steps: readonly Step[],
  withdrawn: readonly AutomationStudioFlowDraftWithdrawal[],
  shown: AutomationStudioFlowDraftShownNumbering
): { refused: AutomationStudioFlowDraftAmendmentRefusal[]; takenBack: number } {
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  // Restoring a head can restore a dependency on another withdrawn source.
  for (let changed = true; changed;) {
    changed = false;
    for (const entry of withdrawn) {
      if (entry.disposition !== "kept" || entry.step.disposition === "kept") continue;
      const held = holder(steps, entry.step);
      if (!held) continue;
      entry.step.disposition = entry.disposition;
      if (entry.settings === undefined) delete entry.step.settings;
      else entry.step.settings = entry.settings;
      refused.push({ step: entry.named, reason: "holds_a_repeat", repeat: shown.number(held.head), holds: held.holds, ...(held.whileLoop ? { whileLoop: true as const } : {}) });
      changed = true;
    }
  }
  return { refused, takenBack: refused.length };
}

/**
 * Takes back each routing the decision wrote that leaves a span of the Flow
 * holding a second step that says when it runs, and refuses it
 * `span_holds_routing`. Answers the refusals and how many applied amendments
 * they take back.
 */
export function automationStudioFlowDraftSettleSpanRouting(
  steps: readonly Step[],
  written: readonly AutomationStudioFlowDraftWrittenRouting[],
  shown: AutomationStudioFlowDraftShownNumbering
): { refused: AutomationStudioFlowDraftAmendmentRefusal[]; takenBack: number } {
  const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
  const pending = new Set(written);
  for (;;) {
    const active = new Map([...pending].filter((entry) => entry.step.routing === entry.routing && automationStudioFlowDraftStepIsProposed(entry.step)).map((entry) => [entry.step, entry]));
    const conflict = spanConflicts(steps).find((span) => span.contributors.some((step) => active.has(step)) || active.has(span.routed));
    if (!conflict) break;
    // If this decision wrote the outer repeat too, refuse that repeat rather
    // than changing an otherwise valid inner statement. A shared-source head
    // that extends the span is responsible for the extension as well.
    const entry = conflict.contributors.map((step) => active.get(step)).find((candidate) => candidate !== undefined) ?? active.get(conflict.routed)!;
    pending.delete(entry);
    if (entry.previous === undefined) delete entry.step.routing;
    else entry.step.routing = entry.previous;
    if (entry.settings === undefined) delete entry.step.settings;
    else entry.step.settings = entry.settings;
    refused.push({ step: entry.amendment.step, reason: "span_holds_routing", repeat: shown.number(conflict.head), through: shown.number(conflict.through), routed: shown.number(conflict.routed) });
  }
  return { refused, takenBack: refused.length };
}

/** The repeat in the Flow, on another step, that names `step` as its `over` or its span's last step, or nothing. */
function holder(steps: readonly Step[], step: Step): { head: Step; holds: "over" | "through"; whileLoop: boolean } | undefined {
  const id = automationStudioFlowDraftStepId(step);
  for (const head of steps) {
    const routing = head.routing;
    if (head === step || routing?.kind !== "repeat" || !automationStudioFlowDraftStepIsProposed(head)) continue;
    if (!automationStudioFlowDraftRoutingReferences(routing).includes(id)) continue;
    const whileLoop = automationStudioFlowDraftRepeatIsWhile(routing);
    return { head, holds: !whileLoop && routing.over === id ? "over" : "through", whileLoop };
  }
  return undefined;
}

/**
 * Routed bodies after assembly's `effectiveSteps` normalization: implicit
 * interruption routing, and shared-source repeats merged into one span. Track
 * every head that contributes to that span, since a new adjacent repeat can
 * extend an existing span over another routed step.
 */
function spanConflicts(steps: readonly Step[]): { head: Step; through: Step; routed: Step; contributors: Step[] }[] {
  const flow = steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => ({
    step,
    routing: automationStudioFlowDraftStepAnsweredInterruption(step) ? { kind: "optional" as const } : step.routing,
    contributors: [step]
  }));
  const ids = flow.map((entry) => automationStudioFlowDraftStepId(entry.step));
  for (const [start, head] of flow.entries()) {
    const routing = head.routing;
    if (routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(routing)) continue;
    let end = ids.indexOf(routing.through);
    if (end < start) continue;
    for (let next = start + 1; next <= end + 1 && next < flow.length; next += 1) {
      const member = flow[next]!;
      if (member.routing?.kind !== "repeat" || automationStudioFlowDraftRepeatIsWhile(member.routing)
        || member.routing.over !== routing.over || ids.indexOf(member.routing.through) < next) continue;
      end = Math.max(end, ids.indexOf(member.routing.through));
      head.contributors.push(...member.contributors);
      member.routing = undefined;
    }
    head.routing = { ...routing, through: ids[end]! };
  }
  const conflicts: { head: Step; through: Step; routed: Step; contributors: Step[] }[] = [];
  for (const [start, head] of flow.entries()) {
    if (head.routing?.kind !== "repeat") continue;
    const end = ids.indexOf(head.routing.through);
    if (end < start) continue;
    const routed = flow.slice(start + 1, end + 1).find((entry) => entry.routing !== undefined);
    if (routed) conflicts.push({ head: head.step, through: flow[end]!.step, routed: routed.step, contributors: head.contributors });
  }
  return conflicts;
}
