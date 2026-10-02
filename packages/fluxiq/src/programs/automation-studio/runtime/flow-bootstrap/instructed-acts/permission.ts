// The one instructed-act rule a completion is still refused for: an act whose
// verb names a class a person is asked about has a step declaring that class.
//
// **Why this one, and only this one (t195).** Whether a Flow does what the
// instruction asks is decided by the test from the start and a judge of its
// actual results; the instructed-acts verdict (`./check.ts`) and the checklist
// (`./checklist.ts`) are information beside them, and refuse nothing. This rule
// is of another kind: it is not about whether the Flow works but whether the
// person is asked. The gate asks only about the classes it holds serious
// (`delete`, `move_money`, `send_or_publish`), so a withdrawal declared
// `modify_existing` goes ahead with nobody asked -- withdraw run 3
// (`run-munnyvbr-11c28a0f`, withdraw audit R2, `./act-consequence.ts`). No test
// or judge after the fact can undo that, so it is refused while the build can
// still declare it.
//
// **Every step named for such an act, whatever else is wrong with it.** The
// steps named are the draft's own (`acts` on a step) and the model's result
// claims, read one way with `./check.ts`. Each that is kept and changed
// something is held to the declaration with the span that repeats it
// (`./step-fault.ts`), even when it is optional, unrepeated or names another
// act's object: a step that may run is a step that may act unasked. An act no
// step is named for is left to the test and the judge.
//
// Nothing here calls a provider or reads a page.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import {
  AUTOMATION_STUDIO_INSTRUCTED_ACT_CONSEQUENCE_INSTRUCTION,
  AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE,
  AUTOMATION_STUDIO_INSTRUCTED_ACTS_INSTRUCTION,
  automationStudioInstructedActClaimedStep,
  automationStudioInstructedActClaims
} from "./check.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { automationStudioInstructedActConsequenceUndeclared } from "./step-fault.ts";

/** Every act a person is asked about has a declaring step, or what the model is told instead. */
export type AutomationStudioInstructedActPermissionVerdict =
  | { ok: true }
  | { ok: false; issue: AutomationStudioFlowBootstrapIssue; missingActs: JsonObject; instruction: string };

/** Whether every step named for an act of a class a person is asked about declares that class. */
export function checkAutomationStudioInstructedActPermissions(input: {
  instructionText?: string | undefined;
  result: JsonObject;
  draftSteps?: readonly AutomationStudioFlowDraftStep[] | undefined;
}): AutomationStudioInstructedActPermissionVerdict {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  const steps = input.draftSteps;
  if (!steps || !acts.some((act) => act.consequence)) return { ok: true };
  const claims = automationStudioInstructedActClaims({ acts, choices: acts.flatMap((act) => act.requires ?? []), result: input.result });
  const undeclared = acts.flatMap((act) => {
    if (!act.consequence) return [];
    const named = steps.filter((step) => step.acts?.some((id) => id.trim().toLowerCase() === act.id));
    const claimed = (claims.get(act.id) ?? []).flatMap((claim) => automationStudioInstructedActClaimedStep(steps, claim.step) ?? []);
    const doing = [...new Set([...named, ...claimed])]
      .filter((step) => step.disposition === "kept" && step.effect === "mutate" && automationStudioFlowDraftStepIsProposable(step))
      .sort((left, right) => left.position - right.position);
    const unasked = doing.find((step) => automationStudioInstructedActConsequenceUndeclared(act, step, steps));
    return unasked ? [{ id: act.id, kind: act.kind, verb: act.verb, quote: act.quote, consequence: act.consequence, reason: "act_consequence_undeclared", step: `${unasked.position}` }] : [];
  });
  if (!undeclared.length) return { ok: true };
  return {
    ok: false,
    issue: {
      severity: "error",
      code: AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE,
      // Core's own sentence, quoting nothing; the person's words travel under `missingActs`.
      message: "The instruction asks for an act a person must be asked about, and a kept step named as doing it does not declare that class of consequence.",
      path: "acts"
    },
    missingActs: { acts: undeclared },
    instruction: AUTOMATION_STUDIO_INSTRUCTED_ACTS_INSTRUCTION + AUTOMATION_STUDIO_INSTRUCTED_ACT_CONSEQUENCE_INSTRUCTION
  };
}
