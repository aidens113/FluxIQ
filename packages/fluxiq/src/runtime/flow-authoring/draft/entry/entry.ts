import type { JsonValue, JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftReplacingStep } from "../amendment/index.ts";
import { automationStudioFlowDraftBindablePaths } from "../bindable/index.ts";
import { automationStudioFlowDraftRenderBindings } from "../binding-render.ts";
import { automationStudioFlowDraftInputs } from "../inputs/index.ts";
import type { DraftPresentation } from "../presentation/index.ts";
import type { AutomationStudioFlowDraftRoute } from "../route-places/index.ts";
import type { AutomationStudioFlowDraftStepRouting } from "../routing/index.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftRepeatIsWhile, automationStudioFlowDraftStepId } from "../routing/index.ts";
import type { AutomationStudioFlowDraftStep } from "../step/index.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "../step/index.ts";
import { automationStudioFlowDraftReplayOutcomeWord } from "../verification/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "./tool-id.ts";

const DRAFT_CODE = "llm_evidence_loop.draft";

export function automationStudioFlowDraftEntry(input: {
    steps: readonly AutomationStudioFlowDraftStep[];
    authored?: boolean | undefined;
    acts?: JsonValue | undefined;
    route?: AutomationStudioFlowDraftRoute | undefined;
}, presentation: Pick<DraftPresentation, "entryInstruction" | "withdrawal">): {
    callId: string;
    toolId: string;
    value: JsonValue;
} | undefined {
    const listed = input.steps;
    const acts = input.acts;
    const inputs = automationStudioFlowDraftInputs(listed).inputs;
    if (!listed.some(automationStudioFlowDraftStepIsAction) && acts === undefined)
        return undefined;
    const steps = listed.map((step) => stepLine(step, listed, presentation));
    const route = input.route;
    const value: JsonObject = {
        code: DRAFT_CODE,
        ...(acts === undefined ? {} : { acts }),
        ...(route ? { route: shownRoute(route) } : {}),
        steps,
        ...(inputs.length ? { inputs: inputs.map((entry) => ({ name: entry.name, test: entry.test, steps: entry.steps })) } : {}),
        instruction: presentation.entryInstruction({ mode: input.authored ? "authored" : "transcript", hasBindable: steps.some((line) => Object.hasOwn(line, "bindable")), routeKind: route === undefined ? "none" : route.state, hasReplaced: listed.some((step) => automationStudioFlowDraftReplacingStep(listed, step) !== undefined), hasChecked: listed.some((step) => step.checkedCandidate) })
    };
    return { callId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, value };
}

function shownRoute(route: AutomationStudioFlowDraftRoute): JsonValue {
    if (route.state === "open")
        return "open";
    return { named: route.quote, places: Object.fromEntries(route.places.map((words, index) => [`r${index + 1}`, words])) };
}

function shownBindable(step: AutomationStudioFlowDraftStep): string[] | undefined {
    const offered = automationStudioFlowDraftBindablePaths(step);
    return offered.length === automationStudioFlowDraftBindablePaths({ input: step.input }).length ? undefined : offered;
}

function stepLine(step: AutomationStudioFlowDraftStep, all: readonly AutomationStudioFlowDraftStep[], presentation: Pick<DraftPresentation, "withdrawal">): JsonObject {
    const replacing = automationStudioFlowDraftReplacingStep(all, step);
    if (replacing)
        return { step: step.position, actionId: step.actionId, replacedBy: replacing.position, inResult: false };
    const bindable = automationStudioFlowDraftStepIsProposed(step) ? shownBindable(step) : undefined;
    return {
        step: step.position,
        actionId: step.actionId,
        input: automationStudioFlowDraftRenderBindings(step.input, all),
        ...(step.written ? { written: true } : {}),
        ...(step.checkedCandidate ? { checkedCandidate: { ...step.checkedCandidate, performed: false }, actEvidence: "intended" } : {}),
        ...(step.priorExecution ? { priorExecution: { ...(step.priorExecution.callId ? { callId: step.priorExecution.callId } : {}), performed: true, configuration: "original" } } : {}),
        ...(step.words ? { does: { ...step.words } } : {}),
        ...(step.control && !step.words ? { control: step.control } : {}),
        ...(bindable ? { bindable } : {}),
        ...(step.resultCode ? { resultCode: step.resultCode } : {}),
        changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
        disposition: shownDisposition(step),
        inResult: automationStudioFlowDraftStepIsProposed(step),
        ...(step.cancels !== undefined && step.disposition !== "kept" ? { out: takenOutLine(step, all, presentation) } : {}),
        ...(step.acts?.length ? { act: step.acts.join(", ") } : {}),
        ...(step.places?.length ? { place: step.places.join(",") } : {}),
        ...(step.replayed ? { replayed: automationStudioFlowDraftReplayOutcomeWord(step.replayed) } : {}),
        ...passesOf(step),
        ...(step.routing ? { runs: routingLine(step.routing, all) } : {}),
        ...(step.settings ? { settings: step.settings } : {})
    };
}

function shownDisposition(step: AutomationStudioFlowDraftStep): string {
    if (step.written !== true && step.checkedCandidate === undefined && step.effectApplied === false && (step.effect === "mutate" || automationStudioFlowDraftStepIsAction(step)))
        return "did_not_work";
    return automationStudioFlowDraftStepIsAction(step) ? step.disposition : "look";
}

function routingLine(routing: AutomationStudioFlowDraftStepRouting, all: readonly AutomationStudioFlowDraftStep[]): string {
    const at = (id: string): string => {
        const step = automationStudioFlowDraftStepById(all, id);
        return step ? String(step.position) : "a step no longer in the draft";
    };
    if (routing.kind === "optional")
        return "optional: the Flow carries on when this fails";
    if (routing.kind === "only_if")
        return `only if step ${at(routing.check)} succeeded`;
    if (routing.kind === "on_failed")
        return `on failure, step ${at(routing.to)} runs instead`;
    if (automationStudioFlowDraftRepeatIsWhile(routing))
        return `repeats through step ${at(routing.through)} while it succeeds${routing.most === undefined ? "" : `, at most ${routing.most} passes`}`;
    return `repeats through step ${at(routing.through)}, over step ${at(routing.over)}${routing.most === undefined ? "" : `, on its first ${routing.most} ${routing.most === 1 ? "row" : "rows"}`}`;
}

function takenOutLine(step: AutomationStudioFlowDraftStep, all: readonly AutomationStudioFlowDraftStep[], presentation: Pick<DraftPresentation, "withdrawal">): string {
    const partner = automationStudioFlowDraftStepById(all, step.cancels!);
    if (!partner)
        return presentation.withdrawal({ kind: "partner_absent" });
    const first = partner.position < step.position ? partner : step;
    const later = first === step ? partner : step;
    const paired = partner.cancels === automationStudioFlowDraftStepId(step);
    return presentation.withdrawal({
        kind: !paired ? "unpaired" : step === first ? "paired_first" : "paired_later",
        partner: partner.position, first: first.position, later: later.position,
        previouslyChosen: later.toggle?.to !== "off"
    });
}

function passesOf(step: AutomationStudioFlowDraftStep): JsonObject {
    const passes = (step.replayed as {
        passes?: unknown;
    } | undefined)?.passes;
    if (typeof passes === "number" && Number.isSafeInteger(passes) && passes >= 0)
        return { passes };
    if (Array.isArray(passes))
        return { passes: passes.length };
    return {};
}
