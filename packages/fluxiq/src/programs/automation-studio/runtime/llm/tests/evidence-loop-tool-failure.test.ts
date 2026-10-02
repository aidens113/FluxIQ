import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";
import {
  AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS,
  automationStudioLlmEvidenceParseToolExecutionResult,
  automationStudioLlmEvidenceToolResultInvalidCode
} from "../evidence-loop-decision.ts";

// A tool call that fails is an observation, not the end: Flow creation on the
// realistic professional-network site died on the first press a promotion covered, because
// the loop ended on the throw and never said which call it was.

const inspect: AutomationStudioLlmEvidenceTool = { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } };
const press: AutomationStudioLlmEvidenceTool = { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" };
const tools = [inspect, press];
const PRIVATE = "div#ember789 covers the target: Download the app";
const stalled = () => new Error("stalled");

describe("a tool call that fails, in a loop that observes failures", () => {
  it("is recorded under its call id with a closed code, shown to the model, and the loop goes on", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: { target: "target.2" } })
      .mockResolvedValueOnce({ kind: "complete", result: { plan: "close the prompt first" } });
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "press") throw new Error(PRIVATE);
      return { page: "home" };
    });

    // The guard is named rather than inherited: its default is now a far
    // backstop, because three in a row ended builds that were working.
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, minToolCalls: 1, decide, executeTool, maxStepsWithoutProgress: 3, unusableDecisions: { stalled } });

    expect(result).toMatchObject({ ok: true, result: { plan: "close the prompt first" }, accounting: { iterations: 2, toolCalls: 2 } });
    expect(result.trace[1]).toEqual({
      iteration: 1, decision: "tool_call", callId: "call.press.1", toolId: "press", resultCode: "llm_evidence_loop.tool_failed", evidenceBytes: expect.any(Number),
      progress: { draftRevisionBefore: 0, draftRevisionAfter: 1, pageState: "unobserved", draftState: "changed", answerabilityState: "unobserved" },
      at: expect.any(Number)
    });
    const shown = decide.mock.calls[1]?.[0].evidence;
    // The history and the draft sit after the window, so the failed call's own
    // result is the entry before them, and the history records the failure as
    // a row of its own. The failure is in the draft too: an action that was
    // attempted and did not happen is part of the record of what was done.
    expect(shown.at(-3)).toEqual({ callId: "call.press.1", toolId: "press", value: {
      ok: false, code: "llm_evidence_loop.tool_failed", toolId: "press", stepsWithoutProgress: 1, maxStepsWithoutProgress: 3, instruction: expect.any(String)
    } });
    expect(shown.at(-2)).toMatchObject({ callId: "core.evidence_history", toolId: "core.evidence_history", value: {
      rows: [[0, "look", "inspect", null, "initial.inspect", "ok"], [1, "call_failed", "press", null, "call.press.1", "llm_evidence_loop.tool_failed"]]
    } });
    expect(shown.at(-1)).toMatchObject({ callId: "core.flow_draft", toolId: "core.flow_draft", value: {
      code: "llm_evidence_loop.draft",
      // Position 2: the initial observation is step 1 of the draft and is
      // listed as a look, and a position never shifts, so an amendment always
      // names the same step.
      steps: [{ step: 1, actionId: "inspect", input: {}, changed: "no", disposition: "look", inResult: false }, { step: 2, actionId: "press", input: { target: "target.2" }, resultCode: "llm_evidence_loop.tool_failed", changed: "no", disposition: "did_not_work", inResult: false }]
    } });
    expect(JSON.stringify({ result, shown })).not.toContain("ember789");
  });

  it("names a result that is not one as tool_result_invalid, with the check it failed", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "private result text!" }
        : { page: "home" }
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.trace[1]).toMatchObject({ callId: "call.press.1", resultCode: "llm_evidence_loop.tool_result_invalid.result_code_not_code" });
  });

  // Live run `run-mup2u8o3-6697c4be`: a member the reader had not learned
  // refused a click that had worked, and nothing the model or the record saw
  // said which check. Now both carry it, and never the member itself.
  it("shows the model and the record which check refused the result, and nothing the caller said", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, [PRIVATE]: { waitedMs: 1 } } as never
        : { page: "home" }
    });
    const code = "llm_evidence_loop.tool_result_invalid.unknown_key";
    expect(result.trace[1]).toMatchObject({ callId: "call.press.1", resultCode: code });
    const shown = decide.mock.calls[1]?.[0].evidence;
    expect(shown.find((entry: { callId: string }) => entry.callId === "call.press.1")?.value).toMatchObject({ ok: false, code });
    expect(shown.find((entry: { callId: string }) => entry.callId === "core.evidence_history")?.value.rows.at(-1)).toEqual([1, "call_failed", "press", null, "call.press.1", code]);
    expect(JSON.stringify({ result, shown })).not.toContain("ember789");
  });

  it("runs a click whose page waited out a check that cleared by itself as the success it was", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "search2", toolId: "press", input: { target: "target.5" } })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => toolId === "press"
        ? { kind: "llm_evidence_tool_execution", evidence: { ok: true, navigation: { url: "http://shop.test/s?k=earbuds", type: "reload" } }, effectApplied: true, resultCode: "web.action.succeeded", clearedWait: { waitedMs: 9208 } } as never
        : { page: "home" }
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.trace[1]).toMatchObject({ callId: "search2", resultCode: "web.action.succeeded" });
    const shown = decide.mock.calls[1]?.[0].evidence;
    expect(shown.find((entry: { callId: string }) => entry.callId === "search2")?.value).toMatchObject({ ok: true, navigation: { type: "reload" } });
  });

  it("counts a failed action as a change, so the page may be looked at again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: { target: "target.2" } })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.inspect.2", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    let looks = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, unusableDecisions: { stalled },
      executeTool: async ({ toolId }) => {
        if (toolId === "press") throw new Error(PRIVATE);
        looks += 1;
        return { look: looks };
      }
    });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["press"]);
    expect(decide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(looks).toBe(2);
  });

  it("lets a request that failed be asked again rather than answering it with the failure", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.detect.1", toolId: "detect", input: {} })
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.detect.2", toolId: "detect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    let attempts = 0;
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: [{ toolId: "detect", description: "Find the list.", inputSchema: { type: "object" }, effect: "observe" }],
      decide, unusableDecisions: { stalled },
      executeTool: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("timed out");
        return { list: true };
      }
    });
    expect(attempts).toBe(2);
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
    expect(result.trace.map((step) => step.resultCode)).toEqual(["llm_evidence_loop.tool_failed", undefined, undefined]);
  });

  it("ends as tool_failed once failures run to the no-progress guard, the last one in the trace", async () => {
    let call = 0;
    const decide = vi.fn(async () => ({ kind: "tool_call", callId: `call.press.${++call}`, toolId: "press", input: { attempt: call } }));
    const executeTool = vi.fn(async ({ toolId }: { toolId: string }) => {
      if (toolId === "press") throw new Error(PRIVATE);
      return { page: "home" };
    });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, maxStepsWithoutProgress: 3, unusableDecisions: { stalled } });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { iterations: 3, toolCalls: 4 } });
    expect(result.trace.slice(1).map((step) => [step.callId, step.resultCode])).toEqual([
      ["call.press.1", "llm_evidence_loop.tool_failed"],
      ["call.press.2", "llm_evidence_loop.tool_failed"],
      ["call.press.3", "llm_evidence_loop.tool_failed"]
    ]);
  });

  it("records a failed initial observation, keeps it offered, and does not count it as evidence", async () => {
    let looks = 0;
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.inspect.1", toolId: "inspect", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, minToolCalls: 1, decide, unusableDecisions: { stalled },
      executeTool: async () => {
        looks += 1;
        if (looks === 1) throw new Error("page is loading");
        return { look: looks };
      }
    });
    expect(result.trace[0]).toMatchObject({ iteration: 0, callId: "initial.inspect", toolId: "inspect", resultCode: "llm_evidence_loop.tool_failed" });
    expect(decide.mock.calls[0]?.[0]).toMatchObject({ canComplete: false });
    expect(decide.mock.calls[0]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(decide.mock.calls[1]?.[0]).toMatchObject({ canComplete: true });
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
  });

  it("still ends on cancellation", async () => {
    const controller = new AbortController();
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, signal: controller.signal, unusableDecisions: { stalled },
      decide: async () => ({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} }),
      executeTool: async ({ toolId }) => {
        if (toolId === "inspect") return { page: "home" };
        controller.abort();
        throw new Error("aborted");
      }
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.cancelled" });
  });
});

describe("a tool call that fails, in a loop that ends on failures", () => {
  it("ends at once and records nothing when unusable decisions are not asked again", async () => {
    const decide = vi.fn().mockResolvedValue({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool: async ({ toolId }) => { if (toolId === "press") throw new Error(PRIVATE); return {}; } });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed", accounting: { toolCalls: 1 } });
    expect(result.trace).toHaveLength(1);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("follows an explicit choice either way", async () => {
    const throwing = async ({ toolId }: { toolId: string }) => { if (toolId === "press") throw new Error(PRIVATE); return {}; };
    const pressThenComplete = () => vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "call.press.1", toolId: "press", input: {} })
      .mockResolvedValueOnce({ kind: "complete", result: {} });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, toolFailures: "observe", decide: pressThenComplete(), executeTool: throwing }))
      .resolves.toMatchObject({ ok: true });
    await expect(runAutomationStudioLlmEvidenceLoop({ tools, toolFailures: "end", unusableDecisions: { stalled }, decide: pressThenComplete(), executeTool: throwing }))
      .resolves.toMatchObject({ ok: false, code: "llm_evidence_loop.tool_failed" });
  });
});

// Reading a caller's execution result that says only a person can get past
// what it met. The key list is exact, so a flag the parser has not learned is
// not a result with one field too many -- it is the whole result refused as
// `llm_evidence_loop.tool_result_invalid`, and the build's hand-off to the
// person never sees it. The flag is read only as the literal `true`.
const base = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "USER_INTERVENTION_REQUIRED" }, effectApplied: true } as const;

describe("an execution result that says only a person can get past what it met", () => {
  it("is read, with the flag kept", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ ...base, personNeeded: true }, "mutate")).toEqual({ evidence: base.evidence, effectApplied: true, personNeeded: true });
  });

  it("keeps the flag only as the literal true, and still reads the result", () => {
    for (const personNeeded of [false, "true", 1, null]) {
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ ...base, personNeeded } as never, "mutate");
      expect(parsed).toEqual({ evidence: base.evidence, effectApplied: true });
    }
  });

  it("carries nothing when the caller did not say it", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ ...base }, "mutate")).not.toHaveProperty("personNeeded");
  });
});

describe("a cleared wait on a tool execution result", () => {
  it.each([true, false])("keeps the execution's outcome when effectApplied is %s", (effectApplied) => {
    const result = automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied, resultCode: "tool.outcome", clearedWait: { waitedMs: 12 } }, "mutate");
    expect(result).toEqual({ evidence: {}, effectApplied, resultCode: "tool.outcome" });
  });
  it.each([null, "12", { waitedMs: -1 }])("leaves malformed diagnostic values to the activity reader: %s", (clearedWait) => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, clearedWait }, "mutate")).toEqual({ evidence: {}, effectApplied: false });
  });
  it("still rejects unknown fields", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, unexpected: true }, "mutate")).toBeUndefined();
  });
});

// Reading a caller's tool execution result: which members it may carry, and
// which check a result that is not one failed.
//
// The key list is exact, so a member a caller learns to report before this
// reader learns it refuses the whole call as `tool_result_invalid`, and the
// call is recorded as a failure that never happened. Live run
// `run-mup2u8o3-6697c4be` (call `search2`): a click on a store's "Go" landed on
// a robot check that cleared by itself after 9 s, the web domain reported that
// as `clearedWait: { waitedMs }` beside its result code, and a click that had
// worked was shown to the model as "This call failed and returned no evidence".
// The identical next click met no check, carried no `clearedWait`, and was read.

const RESULTS = "http://127.0.0.1:58717/scenarios/everything-store/s?i=all&field-keywords=&k=wireless+earbuds";

/** `search2` as the web domain returned it, every member kept and the page cut to two elements. */
function reloadClickThatWaitedOutACheck(): Record<string, unknown> {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: {
      schemaVersion: "web-llm-evidence.v2",
      trust: "untrusted-page-evidence",
      location: RESULTS,
      title: "Store : wireless earbuds",
      frame: { isTop: true },
      navigation: { url: RESULTS, type: "reload" },
      blockedBy: [{ name: "Minimum price", blocks: 2, target: "target.209" }],
      elements: [
        { target: "target.141", tag: "div", role: "region", name: "Store app", box: { x: 0, y: 0, width: 10, height: 10 }, onViewport: true, landmark: "region" },
        { target: "target.142", tag: "strong", text: "Shop faster", box: { x: 0, y: 0, width: 10, height: 10 }, onViewport: true, landmark: "region" }
      ],
      truncated: false,
      ok: true,
      node: "web.output.dom-click",
      status: "succeeded",
      pageChanged: true,
      control: "Go",
      read: {
        commandId: "1cb125cc-2f91-43ea-aa1f-07c53ef5e195",
        actionType: "web.dom.click",
        status: "succeeded",
        validation: { status: "passed", expected: "the page the click leads to loads", actual: "the page it landed on loaded" },
        message: "The click navigated its page before it could answer.",
        checkWait: { waitedMs: 9208 },
        startedAt: 1790831851893,
        finishedAt: 1790831861183
      },
      inFlow: true
    },
    effectApplied: true,
    resultCode: "web.action.succeeded",
    draft: {
      actionId: "web.output.dom-click",
      effect: "mutate",
      input: { node: "web.output.dom-click", parameters: { target: { handle: "target.5" } }, consequences: [] },
      ranWith: { node: "web.output.dom-click", parameters: { selector: "[data-testid=\"nav-search-submit\"]", element: { tag: "input", type: "submit", value: "Go" } }, consequences: [] },
      proposes: true,
      replay: { from: { location: "http://127.0.0.1:58717/scenarios/everything-store/" } }
    },
    stateDigests: { before: "web-state.v2:53833:fa6bc323", after: "web-state.v2:418908:15ce82dd" },
    routeState: { page: { location: RESULTS, path: "/scenarios/everything-store/s", title: "Store : wireless earbuds" } },
    clearedWait: { waitedMs: 9208 }
  };
}

describe("a click whose page waited out a check that cleared by itself", () => {
  it("is read, with its evidence and its draft step", () => {
    const ran = reloadClickThatWaitedOutACheck();
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult(ran as never, "mutate");
    expect(parsed).toMatchObject({ evidence: ran.evidence, effectApplied: true, resultCode: "web.action.succeeded", draft: { actionId: "web.output.dom-click", effect: "mutate", proposes: true } });
    expect(automationStudioLlmEvidenceToolResultInvalidCode(ran, "mutate")).toBeUndefined();
  });

  it("is read without clearedWait too, as the identical click after it was", () => {
    const { clearedWait: _clearedWait, ...ran } = reloadClickThatWaitedOutACheck();
    expect(automationStudioLlmEvidenceParseToolExecutionResult(ran as never, "mutate")).toMatchObject({ effectApplied: true, resultCode: "web.action.succeeded" });
  });

  it("lists clearedWait among the members a result may carry", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS).toContain("clearedWait");
    for (const key of Object.keys(reloadClickThatWaitedOutACheck())) expect(AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS).toContain(key);
  });
});

// A refused result names the check it failed, in a closed code: never the
// member's name or value, which are the caller's and may carry the page.
describe("a result that is not one names the check it failed", () => {
  const base = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true } as const;
  const refusal = (value: unknown, effect: "observe" | "mutate" = "mutate") => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult(value as never, effect)).toBeUndefined();
    return automationStudioLlmEvidenceToolResultInvalidCode(value, effect);
  };
  const invalid = (check: string) => `llm_evidence_loop.tool_result_invalid.${check}`;

  it.each<[string, unknown, string]>([
    ["a member the reader has not learned", { ...base, pageText: "Your order for Dana Smith" }, "unknown_key"],
    ["evidence that is not JSON", { ...base, evidence: { at: Number.NaN } }, "evidence_not_json"],
    ["an effectApplied that is not a boolean", { ...base, effectApplied: "yes" }, "effect_applied_not_boolean"],
    ["a targetsUnchanged that is not a boolean", { ...base, targetsUnchanged: 1 }, "targets_unchanged_not_boolean"],
    ["a resultCode that is not a code", { ...base, resultCode: "private result text!" }, "result_code_not_code"],
    ["a draft that is not an object", { ...base, draft: "press" }, "draft.not_object"],
    ["a draft member the reader has not learned", { ...base, draft: { actionId: "press", note: "x" } }, "draft.unknown_key"],
    ["a draft actionId that is not an id", { ...base, draft: { actionId: "press the button" } }, "draft.action_id"],
    ["a draft input that is not a JSON object", { ...base, draft: { input: [1] } }, "draft.input"],
    ["a draft ranWith that is not a JSON object", { ...base, draft: { ranWith: { at: Number.POSITIVE_INFINITY } } }, "draft.ran_with"],
    ["a draft effect outside observe and mutate", { ...base, draft: { effect: "delete" } }, "draft.effect"],
    ["a draft proposes that is not a boolean", { ...base, draft: { proposes: "yes" } }, "draft.proposes"],
    ["a draft replay it cannot read", { ...base, draft: { replay: { from: "home", produced: {} } } }, "draft.replay"],
    ["a bare value that is not JSON", { at: () => 1 }, "not_json"]
  ])("%s", (_name, value, check) => {
    const code = refusal(value);
    expect(code).toBe(invalid(check));
    expect(code).toMatch(/^[a-z0-9_.:-]{1,100}$/i);
    expect(JSON.stringify(code)).not.toMatch(/Dana|press the button|private/);
  });

  it("answers nothing for a result it reads", () => {
    expect(automationStudioLlmEvidenceToolResultInvalidCode(base, "mutate")).toBeUndefined();
    expect(automationStudioLlmEvidenceToolResultInvalidCode({ page: "home" }, "observe")).toBeUndefined();
  });

  // Live run `run-muqilf9s-c3211328`: a list read shows its first rows as the
  // very objects its records hold. Reaching one object by two paths is not a
  // cycle, and every read that returned rows was refused `evidence_not_json`.
  it("reads a result whose evidence holds the same object twice, and still refuses a real cycle", () => {
    const amara = { name: "Amara Osei", mutualFriends: "23 mutual friends" };
    const jonas = { name: "Jonas Weber", mutualFriends: "Aisha Khan and 4 other mutual friends" };
    const read = { ...base, evidence: { ok: true, read: { extracted: [amara, jonas], firstRows: [amara, jonas] } } };
    expect(automationStudioLlmEvidenceToolResultInvalidCode(read, "observe")).toBeUndefined();
    expect(automationStudioLlmEvidenceParseToolExecutionResult(read as never, "observe")).toMatchObject({ evidence: read.evidence });

    const cyclic: Record<string, unknown> = { ok: true };
    cyclic.self = cyclic;
    expect(refusal({ ...base, evidence: cyclic }, "observe")).toBe(invalid("evidence_not_json"));
  });
});
