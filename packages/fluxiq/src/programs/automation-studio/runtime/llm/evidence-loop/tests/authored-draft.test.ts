// The draft the model authors (user, 2026-09-30: "IT SHOULD NOT JUST BLINDLY
// ADD EACH STEP THAT IT TOOK ONE BY ONE IN ORDER. IT SHOULD ONLY ADD STEPS IN A
// WAY THAT MAKE AN INTELLIGENT FLOW!"), the acts checklist beside it (audit A1,
// cause 1), and what progress means once it is authored (audit A1, cause 2).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema, runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_NEEDS_WRITE_CODE,
  AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE,
  AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION,
  AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS,
  automationStudioLlmEvidenceDecisionIssueCodes,
  automationStudioLlmEvidenceParseDecision,
  automationStudioLlmEvidenceParseToolExecutionResult,
  automationStudioLlmEvidenceToolResultInvalidCode
} from "../../evidence-loop-decision.ts";
import { automationStudioLlmEvidenceCallRecord } from "../call-record.ts";
import {
  AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
  AUTOMATION_STUDIO_NODE_OUTPUTS_KEY,
  AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
  automationStudioFlowBootstrapDraftNodeStep,
  automationStudioLlmRunNodeTool
} from "../../node-tools/index.ts";
import { automationStudioLlmEvidenceAuthoredProgress } from "../../evidence-progress/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click", proposes: true } };
const failed = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "web.action.failed" }, effectApplied: false, draft: { actionId: "web.dom.click", proposes: false } };
const call = (index: number, over: JsonObject = {}) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "go", input: { target: `#t${index}` }, ...over });
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

describe("a step the model runs", () => {
  it("is evidence, not a step of the Flow, until the model adds it", async () => {
    const decide = vi.fn().mockResolvedValueOnce(call(1)).mockResolvedValueOnce(call(2, { add: true })).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((step) => [step.id, step.disposition])).toEqual([["d1", "taken"], ["d2", "kept"]]);
    // The draft the next decision reads says so, in the authored telling.
    const draft = shownAt(decide, 1).find((entry) => entry.toolId === "core.flow_draft")!.value;
    expect(JSON.stringify(draft)).toContain("\"disposition\":\"taken\"");
    expect(String(draft.instruction)).toContain("not in the Flow until you add it");
  });

  it("names the act it does when added with act, and a failed call added is still out", async () => {
    const decide = vi.fn().mockResolvedValueOnce(call(1, { act: "a2" })).mockResolvedValueOnce(call(2, { add: true })).mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValueOnce(worked).mockResolvedValueOnce(failed);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((step) => [step.id, step.disposition, step.acts])).toEqual([["d1", "kept", ["a2"]], ["d2", "taken", undefined]]);
  });

  it("is put into the Flow later by an add amendment, at a position and for an act", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(call(1, { add: true }))
      .mockResolvedValueOnce(call(2))
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "add", to: 1, act: "a1" }] })
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps.map((step) => [step.id, step.position, step.disposition, step.acts])).toEqual([["d2", 1, "kept", ["a1"]], ["d1", 2, "kept", undefined]]);
  });

  it("under the transcript rule, is kept as it runs, as a recorded build's was", async () => {
    const decide = vi.fn().mockResolvedValueOnce(call(1)).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 4, maxToolCalls: 4, dryRun: false, draftAuthoring: "transcript", unusableDecisions: { stalled } });
    expect(result.steps[0]?.disposition).toBe("kept");
  });
});

describe("the grammar a call authors with", () => {
  it("offers add and act on a call only where the model authors its draft", () => {
    const authored = JSON.stringify(buildAutomationStudioLlmEvidenceLoopDecisionSchema([go], { type: "object" }, true, false, true));
    const transcript = JSON.stringify(buildAutomationStudioLlmEvidenceLoopDecisionSchema([go], { type: "object" }, true, false));
    expect(authored).toContain("\"add\"");
    expect(authored).toContain("\"act\"");
    expect(transcript).not.toContain("\"act\"");
  });

  it("reads add and act, and an act implies add; an act that is not an id is refused", () => {
    expect(automationStudioLlmEvidenceParseDecision({ kind: "tool_call", callId: "c1", toolId: "go", input: {}, act: "a3" })).toEqual({ kind: "tool_call", callId: "c1", toolId: "go", input: {}, add: true, act: "a3" });
    expect(automationStudioLlmEvidenceParseDecision({ kind: "tool_call", callId: "c1", toolId: "go", input: {}, add: false })).toEqual({ kind: "tool_call", callId: "c1", toolId: "go", input: {} });
    expect(automationStudioLlmEvidenceParseDecision({ kind: "tool_call", callId: "c1", toolId: "go", input: {}, act: "save the kettle" })).toBeUndefined();
    const amendment = automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: [{ step: 2, change: "add", to: 1, act: "a1" }] });
    expect(amendment).toEqual({ kind: "amend_draft", amendments: [{ step: 2, change: "add", to: 1, act: "a1" }] });
  });
});

describe("the acts checklist beside the draft", () => {
  it("is shown from the first decision, before any step has run", async () => {
    const acts = [{ id: "a1", verb: "add", quote: "add the kettle to the cart", todo: "no_step_added" }];
    const decide = vi.fn().mockResolvedValueOnce(call(1, { act: "a1" })).mockResolvedValueOnce(complete);
    await runAutomationStudioLlmEvidenceLoop({
      tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled },
      draft: { acts: () => acts, actsMissing: () => ["a1"] }
    });
    const first = shownAt(decide, 0).find((entry) => entry.toolId === "core.flow_draft")!.value;
    expect(first).toMatchObject({ acts, steps: [] });
  });
});

describe("progress, where the model authors its draft", () => {
  // `run-munwmfrs-b81bbc65`'s shape: open, add, open cart, again and again.
  // Every call applied, and every one used to clear the guard.
  it("is not a call that lands on a state the build was already in, and the redirect names the acts still owed", async () => {
    const states = ["s0", "sA", "sA", "sB", "sB", "sA", "sA", "sB", "sB", "sA", "sA", "sB"];
    const decide = vi.fn().mockImplementation(async ({ iteration }: { iteration: number }) => call(iteration));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 20, maxToolCalls: 20, dryRun: false,
      maxStepsWithoutProgress: 3, unusableDecisions: { maxConsecutive: 3, stalled },
      captureStateDigest: () => states.shift(),
      draft: { acts: () => [{ id: "a1", verb: "add", quote: "add the kettle", todo: "no_step_added" }], actsMissing: () => ["a1"] }
    });
    // Two new states, then three revisits: stopped at the fifth call, not the twentieth.
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(decide).toHaveBeenCalledTimes(5);
    const redirect = shownAt(decide, 4).find((entry) => entry.toolId === "core.no_progress")?.value;
    expect(redirect).toMatchObject({ actsMissing: ["a1"] });
    expect(String(redirect?.instruction)).toContain("does a1");
  });

  it("is a step added to the Flow, wherever the page went", async () => {
    const states = ["s0", "sA", "sA", "sA", "sA", "sA", "sA", "sA"];
    const decide = vi.fn()
      .mockResolvedValueOnce(call(1)).mockResolvedValueOnce(call(2)).mockResolvedValueOnce(call(3, { add: true })).mockResolvedValueOnce(call(4))
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 8, maxToolCalls: 8, dryRun: false,
      maxStepsWithoutProgress: 3, unusableDecisions: { maxConsecutive: 3, stalled },
      captureStateDigest: () => states.shift()
    });
    // Calls 2 and 4 revisit; 3 adds, which clears, so the guard never reaches three.
    expect(result.ok).toBe(true);
  });

  it("is not a step put back that was in the Flow before, nor an act undone and done again", () => {
    const step = (id: string, disposition: AutomationStudioFlowDraftStep["disposition"]): AutomationStudioFlowDraftStep =>
      ({ id, position: 1, iteration: 1, actionId: "x", input: {}, effect: "mutate", effectApplied: true, proposes: true, disposition });
    const steps = [step("d1", "taken")];
    let missing = ["a1"];
    const progress = automationStudioLlmEvidenceAuthoredProgress({ steps, actsMissing: () => missing });
    expect(progress.advanced()).toBe(false);
    steps[0]!.disposition = "kept";
    expect(progress.advanced()).toBe(true);
    steps[0]!.disposition = "exploratory";
    expect(progress.advanced()).toBe(false);
    steps[0]!.disposition = "kept";
    expect(progress.advanced()).toBe(false);
    missing = [];
    expect(progress.advanced()).toBe(true);
    missing = ["a1"];
    expect(progress.advanced()).toBe(false);
    missing = [];
    expect(progress.advanced()).toBe(false);
  });
});

// The decision schema's authoring properties, explained once (t235). `add`
// and `act` were offered on every tool variant with the same two sentences,
// 468 characters a tool on every decision of a build. They are still offered
// on every variant -- a look's call can carry a draft statement that proposes
// a step, so no variant may lose them -- but explained only on the first call
// that can act.
describe("authoring properties in the decision schema", () => {
  const look = (toolId: string): AutomationStudioLlmEvidenceTool => ({
    toolId, description: `${toolId} looks.`, effect: "observe", inputSchema: { type: "object", additionalProperties: false, properties: {} }
  });
  const library: AutomationStudioLlmEvidenceTool = {
    toolId: "core.run_node", description: "Runs a node.", effect: "mutate", perCallEffect: true,
    inputSchema: { type: "object", additionalProperties: false, properties: { node: { type: "string" } } }
  };
  const variants = (tools: AutomationStudioLlmEvidenceTool[], authoring = true): Array<{ toolId: string; properties: JsonObject }> =>
    ((buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }, false, false, authoring).oneOf) as JsonObject[]).map((variant) => {
      const properties = variant.properties as JsonObject;
      return { toolId: (properties.toolId as JsonObject).const as string, properties };
    });

  it("explains add and act on the first call that can act, and offers them bare on every other", () => {
    const shown = variants([look("web.find_on_page"), look("web.describe_element"), library, look("core.describe_nodes")]);
    for (const variant of shown) {
      const add = variant.properties.add as JsonObject;
      const act = variant.properties.act as JsonObject;
      expect(add.type).toBe("boolean");
      expect(act.pattern).toBe("^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$");
      if (variant.toolId === "core.run_node") {
        expect(add.description).toMatch(/put its step into the Flow/u);
        expect(act.description).toMatch(/acts checklist/u);
      } else {
        expect(add.description).toBeUndefined();
        expect(act.description).toBeUndefined();
      }
    }
  });

  it("explains them on the first call when none can act", () => {
    const shown = variants([look("web.find_on_page"), look("web.describe_element")]);
    expect((shown[0]!.properties.add as JsonObject).description).toBeTypeOf("string");
    expect((shown[1]!.properties.add as JsonObject).description).toBeUndefined();
  });

  it("offers neither where the model does not author its draft", () => {
    for (const variant of variants([look("web.find_on_page"), library], false)) {
      expect(variant.properties.add).toBeUndefined();
      expect(variant.properties.act).toBeUndefined();
    }
  });

  it("costs one explanation, not one a tool", () => {
    const tools = [look("web.detect_repeating_structure"), look("web.find_on_page"), look("web.describe_element"), library, look("core.describe_nodes")];
    const authored = JSON.stringify(buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }, false, false, true)).length;
    const plain = JSON.stringify(buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, { type: "object" }, false, false, false)).length;
    // One explained pair plus four bare pairs over the schema with none.
    expect(authored - plain).toBeLessThan(468 + 4 * 120);
  });
});

// The words of the control a step acted on, from the caller's draft statement
// to the core.flow_draft entry the model reads -- and never into the Flow.
// Live run `run-muqiho5c-e830ce01` pressed "Not now" (t1082) and the draft it
// was shown said only `input: {target: {handle: "t1082"}}`. It then added that
// step as its "put three in my cart" act, completed, and the cart was empty.
const pressTool = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const };
const controlPage = "t1009 button \"Add to cart\"\nt1082 button \"Not now\"";
// What a caller returned, as the loop receives it: JSON it has not read yet.
const execution = (control: unknown, evidence: JsonObject = { ok: true, control: "Not now", page: controlPage }): JsonValue => ({
  kind: "llm_evidence_tool_execution",
  evidence,
  effectApplied: true,
  draft: { actionId: "web.output.dom-click", input: { node: "web.output.dom-click", parameters: { target: { handle: "t1082" } }, consequences: [] }, effect: "mutate", proposes: true, control }
}) as JsonValue;

describe("the control's words on a call's draft statement", () => {
  it("are read on the parse path when the call's own evidence showed them", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult(execution("Not now"), "mutate")?.draft?.control).toBe("Not now");
  });

  it("are withheld, never refused, when the call's evidence did not show them or they are not plain words", () => {
    for (const control of ["Place order", "<b>Not now</b>", 42, { name: "Not now" }, ""]) {
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult(execution(control), "mutate");
      expect(parsed?.effectApplied, JSON.stringify(control)).toBe(true);
      expect(parsed?.draft, JSON.stringify(control)).not.toHaveProperty("control");
      expect(automationStudioLlmEvidenceToolResultInvalidCode(execution(control), "mutate")).toBeUndefined();
    }
  });

  it("are cut to a bound", () => {
    const long = `Not now ${"really ".repeat(40)}`.trim();
    const control = automationStudioLlmEvidenceParseToolExecutionResult(execution(long, { page: long }), "mutate")?.draft?.control;
    expect(control?.length).toBeLessThanOrEqual(120);
    expect(control?.startsWith("Not now really")).toBe(true);
  });

  it("are copied onto the call's record", () => {
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(execution("Not now"), "mutate")!;
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, parsed).control).toBe("Not now");
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, {})).not.toHaveProperty("control");
  });
});

describe("the draft the model is shown", () => {
  it("names the control each step pressed beside its input", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "press", input: { target: "t1082" } })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [pressTool], decide, executeTool: vi.fn().mockResolvedValue(execution("Not now")), maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled: () => new Error("stalled") } });
    expect(result.steps[0]?.control).toBe("Not now");
    const shown = (decide.mock.calls[1]![0] as { evidence: Shown }).evidence.find((entry) => entry.toolId === "core.flow_draft")!.value;
    const line = (shown.steps as JsonObject[])[0]!;
    expect(line).toMatchObject({ step: 1, input: { node: "web.output.dom-click", parameters: { target: { handle: "t1082" } }, consequences: [] }, control: "Not now" });
  });
});

describe("the Flow a draft is written into", () => {
  it("never carries the control's words in a step's parameters", () => {
    const written = automationStudioFlowBootstrapDraftNodeStep({
      position: 1, iteration: 1, callId: "call.1", actionId: "web.output.dom-click", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
      input: { node: "web.output.dom-click", parameters: { target: { handle: "t1082" } }, consequences: [] },
      ranWith: { node: "web.output.dom-click", parameters: { selector: "#dismiss" }, consequences: [] },
      effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, control: "Not now"
    });
    expect(written?.entries?.map((entry) => entry.key)).toEqual(["selector", "consequences"]);
    expect(JSON.stringify(written)).not.toContain("Not now");
  });
});

// The host's statement that a press answered a layer standing in front of the
// page -- a dialog, a consent wall, a covering popup -- that was gone after it
// (t174-w60, case 2). Only `true` travels; anything else is the host saying
// nothing, and the call's result is never lost over it.
const interrupting = (interruption: unknown): JsonValue => ({
  kind: "llm_evidence_tool_execution",
  evidence: { ok: true },
  effectApplied: true,
  draft: { actionId: "web.output.dom-click", input: { target: { handle: "t1082" } }, effect: "mutate", proposes: true, interruption }
}) as JsonValue;

describe("a call's statement that it answered an interruption", () => {
  it("is carried on the parse path when it is true", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult(interrupting(true), "mutate")?.draft?.interruption).toBe(true);
  });

  it("is withheld, never refused, when it is anything but true", () => {
    for (const interruption of ["yes", 1, false, "true", { layer: "dialog" }]) {
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult(interrupting(interruption), "mutate");
      expect(parsed?.effectApplied, JSON.stringify(interruption)).toBe(true);
      expect(parsed?.draft, JSON.stringify(interruption)).not.toHaveProperty("interruption");
      expect(automationStudioLlmEvidenceToolResultInvalidCode(interrupting(interruption), "mutate"), JSON.stringify(interruption)).toBeUndefined();
    }
  });

  it("is copied onto the call's record, and onto the step the loop appends", async () => {
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(interrupting(true), "mutate")!;
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, parsed).interruption).toBe(true);
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, {})).not.toHaveProperty("interruption");
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.1", toolId: "press", input: { target: "t1082" } })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [pressTool], decide, executeTool: vi.fn().mockResolvedValue(interrupting(true)), maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled: () => new Error("stalled") } });
    expect(result.steps[0]?.interruption).toBe(true);
  });
});

// Live run `run-muqiojz4-04a7a8fc` (t193, bigbox): every press was a draft line
// with only a handle, and the model named a "×" closing a chat overlay as its
// add-to-cart act. The loop now keeps the domain's words for each call on its
// step, and the draft line shows them as `does`.
describe("the draft says which control each step named", () => {
  const press = (index: number, handle: string, over: JsonObject = {}) => ({ kind: "tool_call", callId: `press.${index}`, toolId: "go", input: { target: { handle } }, ...over });
  const names: Record<string, string> = { t667: "12 Double Rolls", t1091: "×" };
  const named = (_call: { toolId: string; value: JsonObject }): unknown => {
    const handle = (_call.value.target as { handle?: string } | undefined)?.handle;
    return handle && names[handle] ? { target: names[handle] } : undefined;
  };

  it("keeps the domain's words on the step and shows them as does, beside the handle the model wrote", async () => {
    const describeCall = vi.fn(named);
    const decide = vi.fn()
      .mockResolvedValueOnce(press(1, "t667", { add: true }))
      .mockResolvedValueOnce(press(2, "t1091"))
      .mockResolvedValueOnce(press(3, "t404"))
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), describeCall: describeCall as never, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step: AutomationStudioFlowDraftStep) => step.words)).toEqual([{ target: "12 Double Rolls" }, { target: "×" }, undefined]);
    expect(describeCall).toHaveBeenCalledWith({ toolId: "go", value: { target: { handle: "t1091" } } });
    const draft = shownAt(decide, 3).find((entry) => entry.toolId === "core.flow_draft")?.value as { steps: JsonObject[] } | undefined;
    expect(draft?.steps.map((line) => line.does)).toEqual([{ target: "12 Double Rolls" }, { target: "×" }, undefined]);
    expect(draft?.steps[1]?.input).toEqual({ target: { handle: "t1091" } });
  });

  // The "×" closed its overlay, and the page the click left no longer shows
  // its handle: asked after the call, the domain named nothing (t193 lead).
  it("asks for the words before the call runs, while the handle still names its control", async () => {
    let closed = false;
    const describeCall = vi.fn((call: { toolId: string; value: JsonObject }) => (closed ? undefined : named(call)));
    const executeTool = vi.fn(async () => { closed = true; return worked; });
    const decide = vi.fn().mockResolvedValueOnce(press(1, "t1091", { add: true })).mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, describeCall: describeCall as never, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });

    expect(result.steps.map((step: AutomationStudioFlowDraftStep) => step.words)).toEqual([{ target: "×" }]);
  });

  it("records every step, without words, when the domain has none or answers in another shape", async () => {
    const answers: Array<() => unknown> = [() => undefined, () => "×", () => ({ target: 7, text: "  " })];
    const describeCall = vi.fn((_call: { toolId: string; value: JsonObject }) => answers.shift()!());
    const decide = vi.fn()
      .mockResolvedValueOnce(press(1, "t667", { add: true }))
      .mockResolvedValueOnce(press(2, "t1091"))
      .mockResolvedValueOnce(press(3, "t933"))
      .mockResolvedValueOnce(complete);
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool: vi.fn().mockResolvedValue(worked), describeCall: describeCall as never, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });

    expect(result.ok).toBe(true);
    expect(describeCall).toHaveBeenCalledTimes(3);
    expect(result.steps).toHaveLength(3);
    expect(result.steps.every((step: AutomationStudioFlowDraftStep) => !("words" in step))).toBe(true);
  });
});

// t252 (D1): a step written rather than run. The domain checks it, freezes what
// it names, does nothing, and answers `core.run_node.written`; Core marks the
// step written only on that answer.
const writtenRanWith = { node: "web.output.dom-click", parameters: { target: { handle: "t12" } }, consequences: ["send_or_publish"] };
const writtenAnswer = (over: JsonObject = {}, draft: JsonObject = {}): JsonObject => ({
  kind: "llm_evidence_tool_execution",
  evidence: { ok: true, written: true },
  effectApplied: false,
  resultCode: AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
  draft: { actionId: "web.output.dom-click", input: writtenRanWith, ranWith: writtenRanWith, effect: "mutate", proposes: true, written: true, replay: { from: { location: "https://a.example/" } }, ...draft },
  ...over
});

describe("a written step's answer", () => {
  it("is read written only when the domain answered the written code", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult(writtenAnswer(), "mutate")?.draft?.written).toBe(true);
    const acted = automationStudioLlmEvidenceParseToolExecutionResult(writtenAnswer({ resultCode: "web.node.ran", effectApplied: true }), "mutate");
    expect(acted?.draft).toBeDefined();
    expect(acted?.draft).not.toHaveProperty("written");
    const { resultCode: _dropped, ...uncoded } = writtenAnswer();
    expect(automationStudioLlmEvidenceParseToolExecutionResult(uncoded, "mutate")?.draft).not.toHaveProperty("written");
  });

  it("withholds a written flag that is not true, never refusing the call", () => {
    for (const written of ["yes", 1, false, { yes: true }]) {
      const answer = writtenAnswer({}, { written });
      expect(automationStudioLlmEvidenceParseToolExecutionResult(answer, "mutate")?.draft, JSON.stringify(written)).not.toHaveProperty("written");
      expect(automationStudioLlmEvidenceToolResultInvalidCode(answer, "mutate"), JSON.stringify(written)).toBeUndefined();
    }
  });

  it("carries a node's outputs, as an object only, and never inside the evidence the model is shown", () => {
    const records = [{ name: "Ada" }, { name: "Grace" }];
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(writtenAnswer({ outputs: { records } }), "mutate");
    expect(parsed?.outputs).toEqual({ records });
    expect(JSON.stringify(parsed?.evidence)).not.toContain("Grace");
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS).toContain(AUTOMATION_STUDIO_NODE_OUTPUTS_KEY);
    for (const outputs of [[records], "rows", 3, null]) {
      const answer = writtenAnswer({ outputs: outputs as JsonValue });
      expect(automationStudioLlmEvidenceToolResultInvalidCode(answer, "mutate"), JSON.stringify(outputs)).toBeUndefined();
      expect(automationStudioLlmEvidenceParseToolExecutionResult(answer, "mutate"), JSON.stringify(outputs)).not.toHaveProperty("outputs");
    }
  });

  it("is copied onto the call's record as the parse path let it through", () => {
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(writtenAnswer(), "mutate")!;
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, parsed).written).toBe(true);
    const acted = automationStudioLlmEvidenceParseToolExecutionResult(writtenAnswer({ resultCode: "web.node.ran", effectApplied: true }), "mutate")!;
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, acted)).not.toHaveProperty("written");
    expect(automationStudioLlmEvidenceCallRecord(pressTool, {}, {})).not.toHaveProperty("written");
  });

  it("puts the step into the Flow, written, though nothing was done", async () => {
    const runNode = automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-click"] })!;
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "w1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input: { ...writtenRanWith, write: true } })
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValue(writtenAnswer());
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [runNode], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(executeTool.mock.calls[0]![0]).toMatchObject({ toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, value: { ...writtenRanWith, write: true } });
    expect(result.steps.map((step: AutomationStudioFlowDraftStep) => [step.disposition, step.written, step.effectApplied])).toEqual([["kept", true, false]]);
  });

  it("is an ordinary step when the domain ignored write and acted", async () => {
    const runNode = automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-click"] })!;
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "w1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input: { ...writtenRanWith, write: true } })
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValue(writtenAnswer({ resultCode: "web.node.ran", effectApplied: true }));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools: [runNode], decide, executeTool, maxIterations: 4, maxToolCalls: 4, dryRun: false, unusableDecisions: { stalled } });
    expect(result.steps[0]).not.toHaveProperty("written");
    expect(result.steps[0]?.disposition).toBe("kept");
  });
});

// t252 (D1, D3): the decision that writes a step, and the one that may not
// carry a binding because it runs now.
describe("the decision parse of a node call", () => {
  const nodeCall = (input: JsonObject, over: JsonObject = {}): JsonObject => ({ kind: "tool_call", callId: "c1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input, ...over });

  it("reads write true as add, and translates the binding forms into state bindings before the call is sent", () => {
    const input = { node: "web.output.dom-fill", parameters: { target: { handle: "t3" }, text: { $input: "query", test: "blue towels" }, labels: [{ $row: "name" }], kept: { $state: { path: "item.id" } } }, consequences: [], write: true };
    expect(automationStudioLlmEvidenceParseDecision(nodeCall(input))).toEqual({
      kind: "tool_call", callId: "c1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, add: true,
      input: { ...input, parameters: { target: { handle: "t3" }, text: { $state: { path: "query", fallback: "blue towels" } }, labels: [{ $state: { path: "item.name" } }], kept: { $state: { path: "item.id" } } } }
    });
    expect(automationStudioLlmEvidenceDecisionIssueCodes(nodeCall(input))).toBeUndefined();
  });

  it("keeps act beside a written call, and a written call with nothing bound is still a written call", () => {
    const input = { node: "web.output.dom-click", parameters: { target: { handle: "t3" } }, consequences: [], write: true };
    expect(automationStudioLlmEvidenceParseDecision(nodeCall(input, { act: "a2" }))).toEqual({ kind: "tool_call", callId: "c1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input, add: true, act: "a2" });
  });

  it("refuses a written call whose binding cannot be read, naming each path and reason", () => {
    const input = { node: "web.output.dom-fill", parameters: { text: { $input: "query" }, rows: [{ $step: 2, output: "records" }] }, consequences: [], write: true };
    expect(automationStudioLlmEvidenceParseDecision(nodeCall(input))).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionIssueCodes(nodeCall(input))).toEqual([
      AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE,
      `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.malformed:parameters.text`,
      `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.step_binding_not_yet:parameters.rows.0`
    ]);
  });

  it("refuses a call that runs now with a binding in its parameters", () => {
    for (const parameters of [{ text: { $input: "query", test: "towels" } }, { deep: [{ $row: "name" }] }, { kept: { $state: { path: "item.id" } } }] as JsonObject[]) {
      for (const write of [undefined, false]) {
        const input: JsonObject = { node: "web.output.dom-fill", parameters, consequences: [], ...(write === undefined ? {} : { write }) };
        expect(automationStudioLlmEvidenceParseDecision(nodeCall(input)), JSON.stringify(input)).toBeUndefined();
        expect(automationStudioLlmEvidenceDecisionIssueCodes(nodeCall(input)), JSON.stringify(input)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_NEEDS_WRITE_CODE]);
      }
    }
  });

  it("leaves every other call as it was", () => {
    const live = { node: "web.output.dom-fill", parameters: { text: "towels" }, consequences: [] };
    expect(automationStudioLlmEvidenceParseDecision(nodeCall(live))).toEqual({ kind: "tool_call", callId: "c1", toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input: live });
    const other = { kind: "tool_call", callId: "c1", toolId: "go", input: { text: { $row: "name" }, write: true } };
    expect(automationStudioLlmEvidenceParseDecision(other)).toEqual(other);
    expect(automationStudioLlmEvidenceDecisionIssueCodes(other)).toBeUndefined();
    expect(automationStudioLlmEvidenceDecisionIssueCodes({ kind: "tool_call", callId: "c1" })).toBeUndefined();
  });

  it("is refused through the loop's unusable-decision path, which tells the model why and asks again", async () => {
    const runNode = automationStudioLlmRunNodeTool({ nodeIds: ["web.output.dom-fill"] })!;
    const decide = vi.fn()
      .mockResolvedValueOnce(nodeCall({ node: "web.output.dom-fill", parameters: { text: { $input: "query", test: "towels" } }, consequences: [] }))
      .mockResolvedValueOnce(nodeCall({ node: "web.output.dom-fill", parameters: { text: { $input: "query" } }, consequences: [], write: true }, { callId: "c2" }))
      .mockResolvedValueOnce(complete);
    const executeTool = vi.fn().mockResolvedValue(worked);
    await runAutomationStudioLlmEvidenceLoop({ tools: [runNode], decide, executeTool, maxIterations: 6, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled } });
    expect(executeTool).not.toHaveBeenCalled();
    const first = shownAt(decide, 1).find((entry) => entry.toolId === "core.decision_check")!.value;
    expect(first.issueCodes).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_NEEDS_WRITE_CODE]);
    expect(String(first.instruction)).toContain("A binding runs only in the Flow; write the step (write true), or run it with the value and bind it after");
    const second = shownAt(decide, 2).find((entry) => entry.toolId === "core.decision_check")!.value;
    expect(second.issueCodes).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.malformed:parameters.text`]);
    expect(String(second.instruction)).toContain("\"test\"");
  });
});

// t252 (D8): what the model is told about running, writing and looping.
describe("the policy where the result is a Flow", () => {
  it("lets the model run to learn and write what it has learnt, and makes repetitive work a loop", () => {
    const policy = AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION;
    expect(policy).not.toContain("run each step it needs once and add it");
    expect(policy).toContain("run steps to learn what works and add the ones the Flow needs");
    expect(policy).toContain("write a step without running it (core.run_node with write true)");
    expect(policy).toContain("repetitive work is a loop, not a sequence");
    expect(policy).toContain("never doing it to every item");
    expect(policy).toContain("is bound ({\"$input\": ...}, {\"$row\": ...}), never typed in");
    // Pinned elsewhere (`../../tests/evidence-loop-provider.test.ts`), kept.
    expect(policy).toContain("Never mutate merely to perform an eventual workflow step");
    expect(policy).toContain("never repeat a successful mutation merely to try another eventual-workflow value");
  });

  it("says add is for a step run or written, and that write implies it", () => {
    const schema = buildAutomationStudioLlmEvidenceLoopDecisionSchema([go], { type: "object" }, true, false, true);
    const add = ((schema.oneOf as JsonObject[]).find((variant) => (variant.properties as JsonObject).toolId !== undefined)!.properties as JsonObject).add as JsonObject;
    expect(add.description).toContain("a step you run or write");
    expect(add.description).toContain("write true implies add");
  });
});
