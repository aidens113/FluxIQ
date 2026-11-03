// Where a plan step with no witness stands, and what the builder is told (t791 fix 2). A ref is read in one tab and shows
// a press's change only for a press in that tab, so a step is offered the refs read in its own tab and no others; and when
// no call in its tab can give Core a place that shows its change (`./step-reach.ts`) it is told so, not
// sent after a ref that cannot exist. Asked at submission (`note`, from `admitStep`) and again before a trial
// (`ofNode`, from a project reset's `admit`); the step's trial runs either way. Generic: no site is named.

import type { AutomationStudioSiteResetAdmissionDeclared } from "./contracts.ts";
import { automationStudioSiteResetStepReach as stepReach } from "./step-reach.ts";
import type { AutomationStudioSiteResetCanMeet } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetIssuedRef } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetCreateBaselines } from "../site-reset/index.ts";
import { AutomationStudioSiteResetStepResources as Resources } from "./step-resources.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../site-reset/words.ts";

/** What is known of a step with no witness: whether a call in its tab can make one, and the refs read in that tab. */
export type AutomationStudioSiteResetStepReachAnswer = { canMeet: AutomationStudioSiteResetCanMeet; issued: AutomationStudioSiteResetIssuedRef[] };

/** The note a plan step is given at submission when it has no witness: `canMeet`, and the builder's words for it. */
export type AutomationStudioSiteResetStepGap = { canMeet: AutomationStudioSiteResetCanMeet; instruction: string };

/** A plan step put to the step door: its node's key, and the gap filled in when it has no witness (an out slot, so wrappers that forward the call need no change). */
export type AutomationStudioSiteResetStepAsk = { ref: string; gap?: AutomationStudioSiteResetStepGap };

/** What the permission check a plan step is resolved under carries beside it: the nodes noted with no witness by their `<subflow>.<node>` key (`action-permissions.ts`, `planStep`), which a submission reads. */
export type AutomationStudioPlanStepGaps = { gaps?(): ReadonlyMap<string, AutomationStudioSiteResetStepGap> };

export class AutomationStudioSiteResetStepGaps {
  constructor(private readonly baselines: Pick<AutomationStudioSiteResetCreateBaselines, "issuedRefsIn" | "isSealed" | "steps">) {}

  /** Whether a call in the tab of a control with this identity can make a witness, and the refs read in that tab. */
  reach(seen: { resource?: string | undefined; identified: boolean }): AutomationStudioSiteResetStepReachAnswer {
    const issued = this.baselines.issuedRefsIn(seen.resource);
    return { canMeet: stepReach({ resource: seen.resource, identified: seen.identified, issuedHere: issued, sealed: this.baselines.isSealed() }), issued };
  }

  /** What is known of a trial's step, by its node; none where the step door was never asked about it. */
  ofNode(definitionId: string | undefined, ref: string | undefined): AutomationStudioSiteResetStepReachAnswer | undefined {
    const seen = definitionId !== undefined && ref !== undefined ? this.baselines.steps.of(Resources.key(definitionId, ref)) : undefined;
    return seen ? this.reach(seen) : undefined;
  }

  /**
   * The step door was asked about a node (`admitStep`): keeps its control's tab, and where the answer was no stamp, fills
   * `ask.gap` with the builder's words. Never refuses: the step's trial runs.
   */
  asked(declared: AutomationStudioSiteResetAdmissionDeclared, definitionId: string | undefined, ask: AutomationStudioSiteResetStepAsk, stamp: unknown): void {
    const { control } = declared;
    const seen = { ...(control.resource !== undefined ? { resource: control.resource } : {}), identified: control.subject !== undefined || control.page !== undefined || control.scope !== undefined };
    if (definitionId !== undefined) this.baselines.steps.note(Resources.key(definitionId, ask.ref), seen);
    if (stamp !== undefined) return;
    const { canMeet, issued } = this.reach(seen);
    ask.gap = { canMeet, instruction: canMeet === "no_call" ? WORDS.stepWitnessUnreachable() : `${WORDS.stepWitnessRequired(issued)} Until it has one, its trial runs and is judged by its end view and each step's done-when check only.` };
  }
}
