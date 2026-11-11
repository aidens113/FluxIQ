// A repeat that runs its span again while the span's last step succeeds is
// refused as it is written when that step can never answer ended, with
// assembly's own sentence naming the library's nodes that do end a loop
// (`../draft-acts.ts`, `loopNeverEnds`). Run `run-mwblz4aq-0baa810a` wrote such
// a loop on a press; assembly refused it only after the answer, the model never
// saw why, and a count capped the press at 20 passes, 19 of them for nothing.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../framework/automation-service/nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-authoring/bootstrap/plan/tests/index.ts";
import { assembleAutomationStudioFlowDraftPlan } from "../../../flow-authoring/bootstrap/index.ts";
import { applyAutomationStudioFlowDraftAmendments, type AutomationStudioFlowDraftAmendment, type AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceDraftAmendmentFeedback } from "../../draft-amendment-feedback/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, automationStudioFlowBootstrapDraftNodeStep } from "../../node-tools/index.ts";
import { automationStudioFlowBootstrapCompletionIssueFeedback } from "../completion-issue-feedback.ts";
import { automationStudioFlowBootstrapDraftActs } from "../draft-acts.ts";

// The library: the web fixture plus a next-page node that answers `ended` when
// there is no further page, as the domain declares it downstream.
const ENDED: AutomationNodePort = { id: "ended", label: "Ended", valueType: "any", role: "branch" };
function nextPage(): AutomationStudioNodeDefinition {
  const click = webDomainNodeDefinitionsFixture().find((definition) => definition.id === "web.output.dom-click")!;
  return { ...click, id: "web.output.dom-next_page", label: "Next Page", description: "Go to the list's next page, and answer ended when there is none.", outputs: [...click.outputs, ENDED] };
}
const registry = new AutomationStudioNodeRegistry();
for (const definition of [...webDomainNodeDefinitionsFixture(), nextPage()]) registry.register(definition);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

/** A step the model ran through the library-as-one-verb, so Core can write it down. */
function step(position: number, node: string, parameters: Record<string, string>): AutomationStudioFlowDraftStep {
  return { position, id: `d${position}`, iteration: position, callId: `call.${position}`, toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, actionId: node, input: { parameters }, effect: "mutate", effectApplied: true, disposition: "kept" };
}

/** Open a page, read its rows, then a last step that moves on: a plain press, or a next-page step. */
const draft = (last: string): AutomationStudioFlowDraftStep[] => [
  step(1, "web.output.browser-navigate", { url: "https://example.test/archive" }),
  step(2, "web.output.dom-extract_list", { selector: ".entry" }),
  step(3, last, { selector: "a.more" })
];

const acts = automationStudioFlowBootstrapDraftActs({ registry, resolution });
const repeatWhile = (most?: number): AutomationStudioFlowDraftAmendment => ({ step: 2, change: "repeat", while: 3, ...(most === undefined ? {} : { most }) });
const ENDING_NODES = '(in this library: web.output.dom-next_page, "Next Page")';

describe("a while-loop that cannot end, refused when it is written", () => {
  it("refuses a repeat while a plain press succeeds, puts the step back, and tells the model assembly's sentence naming the nodes that end a loop", () => {
    const steps = draft("web.output.dom-click");
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [repeatWhile()], { loopNeverEnds: acts.loopNeverEnds });

    expect(amended.applied).toBe(0);
    expect(steps[1]!.routing).toBeUndefined();
    expect(amended.refused).toEqual([expect.objectContaining({ step: 2, reason: "repeat_never_ends" })]);
    const said = amended.refused[0]!.said!;
    expect(said).toContain("A loop ends when its last step answers ended because there is nothing more");
    expect(said).toContain(ENDING_NODES);
    expect(said).toContain("amend_draft unrepeat on step 2");

    // The same sentence assembly refuses the Flow with: one rule, asked rather than restated.
    const routed = draft("web.output.dom-click").map((each) => each.position === 2 ? { ...each, routing: { kind: "repeat" as const, through: "d3", while: "d3" } } : each);
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps: routed, write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Read every entry" });
    expect(assembled.issues.find((issue) => issue.code === "flow_draft.repeat_while_never_ends")?.message).toBe(said);

    // What the model reads next: the reason, Core's sentence on the entry, and the same sentence as what to do.
    const told = automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: amended.refused, applied: amended.applied, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 6 });
    const entry = (told.refused as { reason: string; said?: string; next: string }[])[0]!;
    expect(entry.reason).toBe("repeat_never_ends");
    expect(entry.said).toBe(said);
    expect(entry.next).toContain(ENDING_NODES);
    expect(told.reasons).toHaveProperty("repeat_never_ends");
  });

  it("accepts a loop whose last step is a node that answers ended", () => {
    const steps = draft("web.output.dom-next_page");
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [repeatWhile()], { loopNeverEnds: acts.loopNeverEnds });

    expect(amended).toEqual({ applied: 1, refused: [] });
    expect(steps[1]!.routing).toEqual({ kind: "repeat", through: "d3", while: "d3" });
  });

  it("refuses exactly when assembly would: a count the person gave still stands, as it assembles", () => {
    const steps = draft("web.output.dom-click");
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [repeatWhile(3)], { loopNeverEnds: acts.loopNeverEnds });

    expect(amended).toEqual({ applied: 1, refused: [] });
    const assembled = assembleAutomationStudioFlowDraftPlan({ steps, write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Read three pages" });
    expect(assembled.issues.map((issue) => issue.code)).not.toContain("flow_draft.repeat_while_never_ends");
  });

  it("asks nothing without a library to assemble against", () => {
    const steps = draft("web.output.dom-click");
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [repeatWhile()], { loopNeverEnds: automationStudioFlowBootstrapDraftActs({}).loopNeverEnds });
    expect(amended).toEqual({ applied: 1, refused: [] });
  });
});

describe("no guidance or refusal teaches a count as the way a loop ends", () => {
  it("says no `most` in the refusal, its reason or its way out", () => {
    const steps = draft("web.output.dom-click");
    const amended = applyAutomationStudioFlowDraftAmendments(steps, [repeatWhile()], { loopNeverEnds: acts.loopNeverEnds });
    const told = automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: amended.refused, applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 6 });
    expect(JSON.stringify(told)).not.toMatch(/\bmost\b|to bound it|passes it should take/u);
    // With no sentence to carry (no library), the reason's own way out names no count either.
    const bare = automationStudioLlmEvidenceDraftAmendmentFeedback({ refusals: [{ step: 2, reason: "repeat_never_ends" }], applied: 0, steps, stepsWithoutProgress: 1, maxStepsWithoutProgress: 6 });
    expect(JSON.stringify(bare)).not.toMatch(/\bmost\b|to bound it/u);
    expect((bare.refused as { next: string }[])[0]!.next).toContain("answers ended when there is nothing more");
  });
});

// The same refusal met at completion (`../completion-issue-feedback.ts`): it
// reached the model as a bare code, with no word of the nodes that end a loop.
describe("a completion refused for a while-loop that never ends", () => {
  it("carries assembly's sentence, naming the nodes that end a loop", () => {
    const routed = draft("web.output.dom-click").map((each) => each.position === 2 ? { ...each, routing: { kind: "repeat" as const, through: "d3", while: "d3" } } : each);
    const source = assembleAutomationStudioFlowDraftPlan({ steps: routed, write: automationStudioFlowBootstrapDraftNodeStep, registry, resolution, summary: "Read every entry" })
      .issues.find((issue) => issue.code === "flow_draft.repeat_while_never_ends")!;
    const told = automationStudioFlowBootstrapCompletionIssueFeedback({ code: source.code, path: source.path! }, source, undefined);
    expect(told).toEqual({ code: "flow_draft.repeat_while_never_ends", path: "draft.steps.2", message: source.message });
    expect(told.message).toContain(ENDING_NODES);
  });

  it("still carries no sentence for a code outside the authored lists", () => {
    const source = { severity: "error" as const, code: "bootstrap.unknown_parameter", message: "quoted words", path: "draft.steps.2" };
    expect(automationStudioFlowBootstrapCompletionIssueFeedback({ code: source.code }, source, undefined)).toEqual({ code: "bootstrap.unknown_parameter" });
  });
});
