import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
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
    expect(seen[1]!.detail?.text).toBe("core.plan.empty");
  });

  it("is silent outside a scope", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await observed.decide(decideRequest);
    await observed.executeTool(call("domain.inspect"));
    expect(seen).toEqual([]);
  });
});
