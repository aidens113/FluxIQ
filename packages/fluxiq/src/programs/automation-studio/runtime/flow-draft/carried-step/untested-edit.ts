// A change to an optional saved step that the test never exercised is not
// saved: the step goes back to its saved version (t439, supervisor review).
//
// A Flow is saved only after one judged run of the whole Flow from its start.
// An optional step -- the notice it closes, the banner it answers -- is passed
// over by that run when its trigger does not appear, and so is a changed one
// the run cannot send at all (`./carried-step.ts`). Either way the change was
// never seen to work, and saving it would put an untested act in the Flow: the
// live run behind this (`run-mv4912r9-53b05a51`) had its model point the
// "close the notice" step at an unrelated account control while no notice
// stood on the page. So, once the build is finished, each optional step that
// changes a saved one -- edited in place, or rerun in its place (`standsFor`)
// -- and did not pass the test is put back to the saved version, and the
// person is told which step was kept as saved and why.
//
// An unchanged optional step is left as it is, and so is an optional step the
// build added: it is not a change to anything saved.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftSavedInput } from "../scheduled-candidate/index.ts";
import { automationStudioFlowDraftStepId } from "../routing.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step.ts";
import { automationStudioFlowDraftStepCarried } from "./carried-step.ts";

/** The replay words a step passed the test under: run again, or checked and found in place. */
const PASSED: ReadonlySet<string> = new Set(["replayed", "verified", "present"]);

/** What the person is told of one step kept as saved. */
export type AutomationStudioFlowDraftKeptSaved = { position: number; said: string };

/**
 * Puts each optional step of `steps` that changes a saved one in `saved` (the
 * seed as read from the stored Flow) and did not pass the test back to that
 * saved version, in place, and says each one. `describe` gives the domain's
 * words for a call (`../step-words.ts`); without them a step is named by its
 * number.
 */
export function automationStudioFlowDraftKeepSavedUntestedEdits(input: {
  steps: AutomationStudioFlowDraftStep[];
  saved: readonly AutomationStudioFlowDraftStep[];
  describe?: ((call: { toolId: string; value: JsonObject }) => unknown) | undefined;
}): AutomationStudioFlowDraftKeptSaved[] {
  const kept: AutomationStudioFlowDraftKeptSaved[] = [];
  input.steps.forEach((step, index) => {
    if (!automationStudioFlowDraftStepIsProposed(step) || (step.routing?.kind !== "optional" && step.interruption !== true)) return;
    const savedId = step.standsFor ?? automationStudioFlowDraftStepId(step);
    const original = input.saved.find((each) => each.id === savedId && automationStudioFlowDraftStepCarried(each));
    const savedInput = original ? automationStudioFlowDraftSavedInput(original) : undefined;
    if (!original || !savedInput) return;
    const changed = step.id !== original.id || step.ranWith !== undefined || canonical(step.input) !== canonical(savedInput);
    if (!changed || PASSED.has(step.replayed?.status ?? "")) return;
    const restored: AutomationStudioFlowDraftStep = { ...structuredClone(original), input: savedInput, position: step.position };
    input.steps[index] = restored;
    kept.push({ position: step.position, said: keptSaid(named(input.describe, original.toolId ?? original.actionId, savedInput) ?? `step ${step.position}`, step.replayed?.resultCode !== undefined) });
  });
  return kept;
}

/** The plain words a person reads for one step kept as saved: the test tried it and found nothing to act on, or had nothing it could run. */
function keptSaid(name: string, tried: boolean): string {
  return `Kept the saved version of ${name}; the change could not be tested because ${tried ? "the notice it is for did not appear when the Flow was tested" : "the test had no way to run the changed step"}.`;
}

/** The domain's words for the control a saved call acts on, quoted, or nothing. */
function named(describe: ((call: { toolId: string; value: JsonObject }) => unknown) | undefined, toolId: string, value: JsonObject): string | undefined {
  const answer: unknown = describe?.({ toolId, value });
  const target = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as { target?: unknown }).target : undefined;
  return typeof target === "string" && target.trim() ? `"${target.trim().slice(0, 120)}"` : undefined;
}

/** JSON with every object's keys in order, so two writings of one value compare equal. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as JsonObject)[key] as JsonValue)}`).join(",")}}`;
}
