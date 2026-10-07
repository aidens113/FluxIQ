// The phases' test of a stopped round's Flow is said in the chat as the loop's
// own test is (t288 report `fix-ui.md`, R3-U-6): the second build test of a
// live run showed no "Testing:" card, because that test was handed the bare
// tool rather than the one the activity observer wraps.
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import { automationStudioFlowDraftDryRunGate } from "../../../llm/node-tools/index.ts";
import { automationStudioObservedTestTool } from "../observed-test-tool.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const step = (position: number): AutomationStudioFlowDraftStep => ({
  position, iteration: position, actionId: `node.${position}`, toolId: "core.run_node",
  input: { node: `node.${position}`, parameters: {}, consequences: [] },
  ranWith: { node: `node.${position}`, parameters: {}, consequences: [] },
  effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, replay: { from: { location: "https://store.test/" } }
});

const host = () => vi.fn(async (_call: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> =>
  ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "core.replay.replayed" }));

/** The phases' test of a two-step Flow, run in a build's activity scope with the tool given. */
async function tested(executeTool: ReturnType<typeof host> | ReturnType<typeof automationStudioObservedTestTool>): Promise<void> {
  await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => {
    await automationStudioFlowDraftDryRunGate({ enabled: true, steps: [step(1), step(2)], executeTool, accountEvidence: () => 0, showEvidence: () => undefined, targetMoved: () => undefined })();
  });
}

/** The rows the chat was sent for the test's calls, started and ended, by the call's tool. */
const rows = () => seen.filter((event) => event.detail?.ref !== undefined).map((event) => [event.detail?.ref, event.detail?.status]);

describe("the phases' test of a stopped round's Flow", () => {
  it("says each replay in the chat as it starts and ends, through the observed tool", async () => {
    const raw = host();
    await tested(automationStudioObservedTestTool({ executeTool: raw, describeCall: () => ({ title: "Click", target: "Add to cart" }) as never }));
    expect(raw).toHaveBeenCalledTimes(3);
    const said = rows();
    expect(said.filter(([, status]) => status === "started").length).toBeGreaterThanOrEqual(2);
    expect(said.filter(([, status]) => status === "succeeded").length).toBeGreaterThanOrEqual(2);
  });

  it("says nothing with the bare tool, as the second build test of a live run did", async () => {
    await tested(host());
    expect(rows()).toEqual([]);
  });
});
