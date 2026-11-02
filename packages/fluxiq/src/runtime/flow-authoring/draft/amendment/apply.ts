import { automationStudioFlowDraftClaimAct } from "../act-claim.ts";
import { automationStudioFlowDraftKeepOpeners } from "../opener.ts";
import { automationStudioFlowDraftDropReversals } from "../reversal.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE, automationStudioFlowDraftSetRoutePlaces } from "../route-places/index.ts";
import { automationStudioFlowDraftSecondCopy } from "../second-copy.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../step/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID } from "./act-id.ts";
import { automationStudioFlowDraftAmendmentBind } from "./bind.ts";
import type { AutomationStudioFlowDraftAmendmentChange } from "./changes/index.ts";
import { automationStudioFlowDraftAmendmentMove } from "./move.ts";
import { automationStudioFlowDraftAmendmentRoute } from "./route.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, automationStudioFlowDraftReplacingStep } from "./replaced-attempt/index.ts";
import { automationStudioFlowDraftSettleWrittenRepeats, automationStudioFlowDraftTakeOffBrokenRepeats, type AutomationStudioFlowDraftWrittenRepeat } from "./repeat-revalidation/index.ts";
import { automationStudioFlowDraftSettingsRewriteRun } from "./settings-rewrite-run.ts";
import { automationStudioFlowDraftSaidInNumbers } from "./said-numbers.ts";
import { automationStudioFlowDraftShownNumbering } from "./shown-numbering/index.ts";
import { automationStudioFlowDraftReach } from "./reach/index.ts";
import { automationStudioFlowDraftStrandCheck, type AutomationStudioFlowDraftWithdrawal } from "./strand-check/index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftAmendmentRefusal, AutomationStudioFlowDraftClaimRefused, AutomationStudioFlowDraftUnreachedStep } from "./contracts/index.ts";
const ROUTING_CHANGES = new Set<AutomationStudioFlowDraftAmendmentChange>(["optional", "only_if", "on_failed", "repeat"]);
type ActMove = {
    act: string;
    from: number;
    to: number;
};
const NOT_A_FLOW_STEP: AutomationStudioFlowDraftAmendmentRefusal["reason"] = "not_a_kept_step";
export function applyAutomationStudioFlowDraftAmendments(steps: AutomationStudioFlowDraftStep[], amendments: readonly AutomationStudioFlowDraftAmendment[], options: {
    claimRefused?: AutomationStudioFlowDraftClaimRefused | undefined;
} = {}): {
    applied: number;
    refused: AutomationStudioFlowDraftAmendmentRefusal[];
    moved?: ActMove[];
    unreached?: AutomationStudioFlowDraftUnreachedStep[];
} {
    let applied = 0;
    const refused: AutomationStudioFlowDraftAmendmentRefusal[] = [];
    const claims: {
        act: string;
        from: AutomationStudioFlowDraftStep;
        to: AutomationStudioFlowDraftStep;
    }[] = [];
    const shown = automationStudioFlowDraftShownNumbering(steps);
    const written: AutomationStudioFlowDraftWrittenRepeat[] = [];
    let movedStep = false;
    const reachBefore = automationStudioFlowDraftReach(steps);
    const withdrawn: AutomationStudioFlowDraftWithdrawal[] = [];
    let reversalAfterCheck = false;
    for (const amendment of amendments) {
        const step = shown.step(amendment.step);
        if (!step) {
            refused.push({ step: amendment.step, reason: "no_such_step" });
            continue;
        }
        const replacing = automationStudioFlowDraftReplacingStep(steps, step);
        if (replacing) {
            refused.push({ step: amendment.step, reason: AUTOMATION_STUDIO_FLOW_DRAFT_REPLACED_ATTEMPT_REASON, replacedBy: shown.number(replacing) });
            continue;
        }
        if (amendment.change === "rerun") {
            refused.push({ step: amendment.step, reason: "run_by_the_loop" });
            continue;
        }
        if (amendment.change === "unrepeat") {
            if (step.routing?.kind !== "repeat") {
                refused.push({ step: amendment.step, reason: "already_so" });
            }
            else {
                delete step.routing;
                for (const changed of steps.slice(steps.indexOf(step)))
                    delete changed.replayed;
                applied += 1;
            }
            continue;
        }
        if (step.written !== true && step.checkedCandidate === undefined && (automationStudioFlowDraftStepIsAction(step) || step.effect === "mutate") && step.effectApplied === false) {
            refused.push({ step: amendment.step, reason: "did_not_work" });
            continue;
        }
        if (!automationStudioFlowDraftStepIsAction(step) && (amendment.change === "add" || amendment.change === "keep" || amendment.act !== undefined)) {
            refused.push({ step: amendment.step, reason: NOT_A_FLOW_STEP });
            continue;
        }
        const inputNotTaken = amendment.change === "bind" ? undefined : amendment.input;
        if (automationStudioFlowDraftSettingsRewriteRun(step, amendment.settings, inputNotTaken)) {
            refused.push({ step: amendment.step, reason: "settings_rewrite_run" });
            continue;
        }
        const copyOf = (amendment.change === "add" || amendment.change === "keep") && step.disposition !== "kept" ? automationStudioFlowDraftSecondCopy(steps, step) : undefined;
        if (copyOf) {
            refused.push({ step: amendment.step, reason: "second_copy", copyOf: shown.number(copyOf) });
            continue;
        }
        const actOnRead = amendment.act !== undefined && step.effect !== "mutate";
        if (actOnRead)
            refused.push({ step: amendment.step, reason: "act_on_a_read" });
        if (amendment.change === "bind") {
            const bound = automationStudioFlowDraftAmendmentBind(steps, step, amendment, shown);
            if (bound.ok)
                applied += 1;
            else
                refused.push({ step: amendment.step, reason: bound.reason, ...(bound.parameter === undefined ? {} : { parameter: bound.parameter }), ...(bound.control ? { control: true as const } : {}), ...(bound.bindable ? { bindable: bound.bindable } : {}) });
            continue;
        }
        if (amendment.change === "reorder") {
            const to = shown.step(amendment.to);
            if (automationStudioFlowDraftAmendmentMove(steps, step, to, amendment.settings)) {
                applied += 1;
                if (to !== step)
                    movedStep = true;
            }
            else
                refused.push({ step: amendment.step, reason: to ? "already_so" : "no_such_position" });
            continue;
        }
        if (ROUTING_CHANGES.has(amendment.change)) {
            const previous = step.routing;
            const settings = step.settings;
            const routed = automationStudioFlowDraftAmendmentRoute(steps, step, amendment, shown);
            if (routed.ok) {
                applied += 1;
                if (step.routing?.kind === "repeat")
                    written.push({ step, routing: step.routing, amendment, previous, settings });
            }
            else
                refused.push({ step: amendment.step, reason: routed.reason, ...(routed.over === undefined ? {} : { over: routed.over }), ...(routed.through === undefined ? {} : { through: routed.through }) });
            continue;
        }
        const disposition = amendment.change === "keep" || amendment.change === "add" ? "kept" : amendment.change === "drop" ? "dropped" : "exploratory";
        const changesDisposition = step.disposition !== disposition;
        const changesSettings = amendment.settings !== undefined;
        const clearsRouting = amendment.change === "keep" && amendment.act === undefined && amendment.place === undefined && step.routing !== undefined && step.routing.kind !== "repeat";
        const alreadyNamed = amendment.act !== undefined && step.acts?.includes(amendment.act) === true;
        const claimed = disposition === "kept" && !actOnRead && amendment.act !== undefined && AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(amendment.act) && !alreadyNamed ? amendment.act : undefined;
        const claimRefusal = claimed === undefined ? undefined : options.claimRefused?.(steps, step, claimed);
        if (claimRefusal) {
            const written = (position: number): number => {
                const there = steps.find((each) => each.position === position);
                return there ? shown.number(there) : position;
            };
            refused.push({
                step: amendment.step, reason: "act_not_done_there", act: claimRefusal.act, said: automationStudioFlowDraftSaidInNumbers(claimRefusal.said, written),
                ...(claimRefusal.instead !== undefined && steps.some((each) => each.position === claimRefusal.instead) ? { instead: written(claimRefusal.instead) } : {})
            });
        }
        const act = claimRefusal ? undefined : claimed;
        const routePlace = disposition === "kept" && amendment.place !== undefined && AUTOMATION_STUDIO_FLOW_DRAFT_ROUTE_PLACE_VALUE.test(amendment.place) ? amendment.place : undefined;
        const changesPlaces = routePlace !== undefined && automationStudioFlowDraftSetRoutePlaces({ ...step }, routePlace);
        const place = amendment.change === "add" ? shown.step(amendment.to) : undefined;
        const moves = place !== undefined && place !== step;
        if (!changesDisposition && !changesSettings && !clearsRouting && act === undefined && !changesPlaces && !moves) {
            const reason = disposition !== "kept" ? "already_out" : alreadyNamed ? "act_already_named" : routePlace !== undefined ? "already_so" : "already_in_flow";
            if (!actOnRead && !claimRefusal)
                refused.push({ step: amendment.step, reason, ...(reason === "act_already_named" ? { act: amendment.act! } : {}) });
            continue;
        }
        const leavesFlow = disposition !== "kept" && step.disposition === "kept";
        if (leavesFlow)
            withdrawn.push({ step, named: amendment.step, disposition: step.disposition, settings: step.settings });
        step.disposition = disposition;
        if (disposition === "kept")
            automationStudioFlowDraftKeepOpeners(steps, step);
        if (clearsRouting)
            delete step.routing;
        if (act !== undefined)
            for (const from of automationStudioFlowDraftClaimAct(steps, step, act))
                claims.push({ act, from, to: step });
        if (changesPlaces)
            automationStudioFlowDraftSetRoutePlaces(step, routePlace!);
        if (moves && automationStudioFlowDraftAmendmentMove(steps, step, place, undefined))
            movedStep = true;
        if (disposition === "kept") {
            if (withdrawn.length)
                reversalAfterCheck = true;
            else
                automationStudioFlowDraftDropReversals(steps);
        }
        if (amendment.settings)
            step.settings = { ...(step.settings ?? {}), ...amendment.settings };
        applied += 1;
    }
    const settled = automationStudioFlowDraftSettleWrittenRepeats(steps, written, shown);
    applied -= settled.takenBack;
    refused.push(...settled.refused);
    if (movedStep)
        refused.push(...automationStudioFlowDraftTakeOffBrokenRepeats(steps, shown));
    const reach = automationStudioFlowDraftStrandCheck(steps, reachBefore, withdrawn, shown);
    applied -= reach.takenBack;
    refused.push(...reach.refused);
    if (reversalAfterCheck || withdrawn.some((entry) => entry.step.disposition !== "kept"))
        automationStudioFlowDraftDropReversals(steps);
    const moved = movedActs(claims);
    return { applied, refused, ...(moved.length ? { moved } : {}), ...(reach.unreached.length ? { unreached: reach.unreached } : {}) };
}
function movedActs(claims: readonly {
    act: string;
    from: AutomationStudioFlowDraftStep;
    to: AutomationStudioFlowDraftStep;
}[]): ActMove[] {
    const moved: ActMove[] = [];
    for (const { act, from, to } of claims) {
        if (!automationStudioFlowDraftStepIsProposed(from) || from.acts?.length || !to.acts?.includes(act))
            continue;
        if (moved.some((entry) => entry.act === act && entry.from === from.position))
            continue;
        moved.push({ act, from: from.position, to: to.position });
    }
    return moved;
}
