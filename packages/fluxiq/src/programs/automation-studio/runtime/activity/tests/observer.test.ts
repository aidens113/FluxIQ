import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const decideRequest = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
const call = (toolId: string) => ({ callId: "c1", toolId, value: {} });

function loopInput(overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [],
    decide: async () => ({ kind: "secret model output" }),
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { observed: "target content" }, effectApplied: false, resultCode: "tool.ok" }),
    ...overrides
  };
}

describe("observeAutomationStudioEvidenceLoop", () => {
  it("passes every other field through", () => {
    const input = loopInput({ maxIterations: 7 });
    const observed = observeAutomationStudioEvidenceLoop(input);
    expect(observed.maxIterations).toBe(7);
    expect(observed.tools).toBe(input.tools);
    expect(observed.checkCompletion).toBeUndefined();
  });

  it("says thinking on decide and returns the decision unchanged, without its content", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    const decision = await inScope(() => observed.decide(decideRequest));
    expect(decision).toEqual({ kind: "secret model output" });
    expect(seen.map((event) => event.phase)).toEqual(["thinking"]);
    expect(JSON.stringify(seen)).not.toContain("secret");
  });

  it("says exploring for a domain tool, with its id and result code, and never the evidence", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    const result = await inScope(() => observed.executeTool(call("domain.inspect")));
    expect(result).toMatchObject({ resultCode: "tool.ok" });
    expect(seen.map((event) => [event.phase, event.detail?.status, event.detail?.ref])).toEqual([
      ["exploring", "started", "domain.inspect"], ["exploring", "succeeded", "domain.inspect"]
    ]);
    expect(seen[1]!.detail?.text).toBe("Result: tool.ok");
    expect(JSON.stringify(seen)).not.toContain("target content");
  });

  it("says a check that cleared by itself as a waited-out wait, before the call's own end", async () => {
    const cleared = { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "tool.ok", clearedWait: { waitedMs: 12_300 } };
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => cleared }));
    const result = await inScope(() => observed.executeTool(call("domain.act")));
    expect(result).toBe(cleared);
    expect(seen.map((event) => [event.phase, event.detail?.kind, event.detail?.status, event.detail?.ref, event.detail?.resolution])).toEqual([
      ["exploring", "tool", "started", "domain.act", undefined],
      ["waiting_permission", "ask", "started", "waited-out.c1", undefined],
      ["exploring", "ask", "succeeded", "waited-out.c1", "waited_out"],
      ["exploring", "tool", "succeeded", "domain.act", undefined]
    ]);
    expect(seen[2]!.detail?.text).toBe("The check cleared on its own after 12 s.");
  });

  it("says no wait for a malformed cleared wait", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, clearedWait: { waitedMs: "12300" } }) }));
    await inScope(() => observed.executeTool(call("domain.act")));
    expect(seen.map((event) => event.detail?.kind)).toEqual(["tool", "tool"]);
  });

  it("says building for the draft tool", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => ({ ok: true }) }));
    await inScope(() => observed.executeTool(call(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID)));
    expect(seen.map((event) => event.phase)).toEqual(["building", "building"]);
  });

  it("rethrows a tool's error and says it failed", async () => {
    const error = new Error("tool broke");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => { throw error; } }));
    await expect(inScope(() => observed.executeTool(call("domain.act")))).rejects.toBe(error);
    expect(seen.map((event) => event.detail?.status)).toEqual(["started", "failed"]);
  });

  it("rethrows a decide error unchanged", async () => {
    const error = new Error("provider down");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => { throw error; } }));
    await expect(inScope(() => observed.decide(decideRequest))).rejects.toBe(error);
  });

  it("says verifying around the completion check and returns its verdict", async () => {
    const refusal = { ok: false as const, issueCodes: ["core.plan.empty"], feedback: {} };
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: async () => refusal }));
    const check = await inScope(async () => await observed.checkCompletion!({}, { steps: [] }));
    expect(check).toBe(refusal);
    expect(seen.map((event) => [event.phase, event.detail?.status])).toEqual([["verifying", "started"], ["verifying", "failed"]]);
    expect(seen[1]!.detail?.text).toBe("It needs changes before it can be used, and it goes back to be fixed. One thing needs fixing.");
    expect(seen[1]!.detail?.text).not.toContain("core.plan.empty");
  });

  it("says the model's stated reason once decide returns, as a thought naming the action", async () => {
    const decision = automationStudioActivityDecisionReason.attach(
      { kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Get a free quote" } } } },
      "Clicking   the quote button to open the form the request asks about."
    );
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => decision }));
    const returned = await inScope(() => observed.decide(decideRequest));
    expect(returned).toBe(decision);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", status: "started" } });
    expect(seen[1]).toMatchObject({
      phase: "exploring",
      label: "Clicking “Get a free quote”",
      detail: { kind: "thought", title: "Clicking “Get a free quote”", text: "Clicking the quote button to open the form the request asks about.", status: "succeeded" }
    });
  });

  it("says building for a draft edit and verifying for a completion, with their reasons", async () => {
    for (const [value, phase, title] of [
      [{ kind: "amend_draft", amendments: [] }, "building", "Updating the draft Flow"],
      [{ kind: "complete", result: {} }, "verifying", "Checking the Flow is finished"]
    ] as const) {
      seen = [];
      const decision = automationStudioActivityDecisionReason.attach({ ...value }, "Because the draft now covers the request.");
      await inScope(() => observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => decision })).decide(decideRequest));
      expect(seen[1]).toMatchObject({ phase, label: title, detail: { kind: "thought", title, text: "Because the draft now covers the request.", status: "succeeded" } });
    }
  });

  it("says no reason row when the decision carries none", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => ({ kind: "complete", result: {} }) }));
    await inScope(() => observed.decide(decideRequest));
    expect(seen.map((event) => event.phase)).toEqual(["thinking"]);
  });

  it("is silent outside a scope", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await observed.decide(decideRequest);
    await observed.executeTool(call("domain.inspect"));
    expect(seen).toEqual([]);
  });
});
