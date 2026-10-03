// A web step as the web domain records one, and the answers a test gives it,
// for the build-test judge's tests: the model's call by handle as `input`, the
// resolved call -- selector and the element's identity -- as `ranWith`, and the
// page it found as `replay.from`.
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioBuildTestReportInput } from "../summary.ts";

/** The web domain's declared keys, as it declares them. */
export const DENIED = ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"];

/** The keys the web domain declares hold the row a control was found in (`rowContextKeys`), as it declares them. */
export const ROW_CONTEXT = ["record"];

export const SITE = "http://127.0.0.1:61777/scenarios/bigbox-retail/";

type Element = { selector: string; accessibleName?: string; visibleText?: string; context?: { record: { text: string } } };

export function web(position: number, node: string, element: Element, page: string, extra: { parameters?: JsonObject; consequences?: string[]; step?: Partial<AutomationStudioFlowDraftStep> } = {}): AutomationStudioFlowDraftStep {
  const consequences = extra.consequences ?? [];
  return {
    position,
    id: `d${position}`,
    iteration: position,
    actionId: node,
    input: { node, parameters: { target: { handle: `e${position}` }, ...extra.parameters }, consequences },
    ranWith: { node, parameters: { target: element.selector, element, ...extra.parameters } as JsonObject, consequences },
    effect: "mutate",
    effectApplied: true,
    disposition: "kept",
    replay: { from: { location: page } },
    ...extra.step
  };
}

export function navigate(position: number, url = SITE): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "web.output.browser-navigate",
    input: { node: "web.output.browser-navigate", parameters: { url } }, ranWith: { node: "web.output.browser-navigate", parameters: { url } },
    effect: "mutate", effectApplied: true, disposition: "kept", replay: { from: { location: url } }
  };
}

/** The outcome a host answers a check with when it could act now, and did not. */
export function verified(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftReplayOutcome {
  return { step: step.position, stepId: step.id!, actionId: step.actionId, status: "replayed", mode: "verify", resultCode: "core.replay.verified" };
}

/** The outcome a host answers a check with when the step's effect is already in place. */
export function present(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftReplayOutcome {
  return { step: step.position, stepId: step.id!, actionId: step.actionId, status: "replayed", mode: "verify", resultCode: "core.replay.present" };
}

export function replayed(step: AutomationStudioFlowDraftStep): AutomationStudioFlowDraftReplayOutcome {
  return { step: step.position, stepId: step.id!, actionId: step.actionId, status: "replayed" };
}

/** A clean test: every step answered, and what it saw of the steps given. */
export function report(outcomes: AutomationStudioFlowDraftReplayOutcome[], observed: Array<[AutomationStudioFlowDraftStep, JsonValue]> = [], reused = false): AutomationStudioBuildTestReportInput {
  return {
    verdict: { outcomes },
    observations: observed.map(([step, evidence]) => ({ step: step.position, stepId: step.id, evidence })),
    reused
  };
}
