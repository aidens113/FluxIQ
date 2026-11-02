import { automationStudioFlowDraftPrecedingProposedStep, automationStudioFlowDraftStepId, type AutomationStudioFlowDraftStepRouting } from "../routing/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftRepeatRefusal } from "./repeat-revalidation/index.ts";
import type { AutomationStudioFlowDraftShownNumbering } from "./shown-numbering/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal } from "./contracts/index.ts";
export function automationStudioFlowDraftAmendmentRoute(steps: readonly AutomationStudioFlowDraftStep[], step: AutomationStudioFlowDraftStep, amendment: AutomationStudioFlowDraftAmendment, shown: AutomationStudioFlowDraftShownNumbering): {
    ok: true;
} | {
    ok: false;
    reason: AutomationStudioFlowDraftAmendmentRefusal["reason"];
    over?: number;
    through?: number;
} {
    const named = shown.step;
    const before = (): AutomationStudioFlowDraftStep | undefined => automationStudioFlowDraftPrecedingProposedStep(steps, step);
    let routing: AutomationStudioFlowDraftStepRouting;
    if (amendment.change === "optional")
        routing = { kind: "optional" };
    else if (amendment.change === "only_if") {
        const check = named(amendment.check) ?? before();
        if (!check)
            return { ok: false, reason: amendment.check === undefined ? "no_step_before_it" : "no_such_step" };
        if (!automationStudioFlowDraftStepIsProposed(check))
            return { ok: false, reason: "not_a_kept_step" };
        routing = { kind: "only_if", check: automationStudioFlowDraftStepId(check) };
    }
    else if (amendment.change === "on_failed") {
        const to = named(amendment.to);
        if (!to)
            return { ok: false, reason: "no_such_step" };
        if (!automationStudioFlowDraftStepIsProposed(to))
            return { ok: false, reason: "not_a_kept_step" };
        if (to === step)
            return { ok: false, reason: "already_so" };
        routing = { kind: "on_failed", to: automationStudioFlowDraftStepId(to) };
    }
    else if (amendment.while !== undefined) {
        const last = named(amendment.while);
        if (!last)
            return { ok: false, reason: "no_such_step" };
        if (!automationStudioFlowDraftStepIsProposed(last))
            return { ok: false, reason: "not_a_kept_step" };
        const id = automationStudioFlowDraftStepId(last);
        routing = { kind: "repeat", through: id, while: id, ...(amendment.most === undefined ? {} : { most: amendment.most }) };
    }
    else {
        const through = named(amendment.through) ?? step;
        const over = named(amendment.over) ?? before();
        if (!over)
            return { ok: false, reason: amendment.over === undefined ? "no_step_before_it" : "no_such_step" };
        if (!automationStudioFlowDraftStepIsProposed(through) || !automationStudioFlowDraftStepIsProposed(over))
            return { ok: false, reason: "not_a_kept_step" };
        routing = { kind: "repeat", through: automationStudioFlowDraftStepId(through), over: automationStudioFlowDraftStepId(over), ...(amendment.most === undefined ? {} : { most: amendment.most }) };
    }
    if (same(step.routing, routing) && amendment.settings === undefined) {
        const refusal = routing.kind === "repeat" ? automationStudioFlowDraftRepeatRefusal(steps, step, routing, amendment, shown) : undefined;
        if (!refusal)
            return { ok: false, reason: "already_so" };
        return { ok: false, reason: refusal.reason, ...(refusal.over === undefined ? {} : { over: refusal.over }), ...(refusal.through === undefined ? {} : { through: refusal.through }) };
    }
    step.routing = routing;
    if (amendment.settings)
        step.settings = { ...(step.settings ?? {}), ...amendment.settings };
    return { ok: true };
}
function same(left: AutomationStudioFlowDraftStepRouting | undefined, right: AutomationStudioFlowDraftStepRouting): boolean {
    return left !== undefined && JSON.stringify(left) === JSON.stringify(right);
}
