// What a Flow run keeps and says when an output dispatch reports layers the
// client closed over the page (`../attempt.ts`): the layers on the
// attempt trace, and one step `interference` recovery row per attempt.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../nodes/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1",
  flowId: "flow.cleared-layers",
  ownerKind: "task",
  ownerId: "task.cleared-layers",
  name: "Cleared layers",
  createdAt: 1,
  updatedAt: 1,
  nodes: [{ id: "output", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "confirm" } } }],
  edges: []
};

async function inRun(options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, options));
}

// The dispatch payload sits at `outputs.result`, as both IO dispatch paths put it (`io-policy.ts`).
const answering = (payload: JsonValue, extra: Partial<AutomationNodeExecutionResult> = {}): AutomationStudioGraphExecutionOptions => ({
  effectDispatcher: () => ({ status: "success", route: "success", outputs: { ok: true, result: payload }, ...extra })
});

const interferenceRows = () => seen.filter((event) => event.detail?.recovery?.kind === "interference");

describe("a Flow run whose output dispatch closed layers over the page", () => {
  it("keeps the layers on the attempt and says one recovery row about the node", async () => {
    const trace = await inRun(answering({ status: "succeeded", clearedLayers: [{ kind: "promotion", control: "No thanks" }] }));
    expect(trace.attempts[0]).toMatchObject({ status: "succeeded", clearedLayers: [{ kind: "promotion", control: "No thanks" }] });
    const rows = interferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      activityId: "run:run.1",
      phase: "running",
      detail: { kind: "step", status: "succeeded", ref: "output", recovery: { kind: "interference", subject: "Closed a promotion the page put in the way", outcome: "succeeded" } }
    });
    // The dismiss words stay on the trace; the chat never carries them.
    expect(JSON.stringify(rows)).not.toContain("No thanks");
  });

  it("says it for a dispatch that failed after the client closed a layer", async () => {
    const trace = await inRun({ effectDispatcher: () => ({ status: "failed", route: "failed", outputs: { ok: false, result: { clearedLayers: [{ kind: "rate_limit", control: "OK" }] } }, message: "Not found." }) });
    expect(trace.attempts[0]).toMatchObject({ status: "failed", clearedLayers: [{ kind: "rate_limit", control: "OK" }] });
    expect(interferenceRows().map((event) => event.detail?.recovery?.subject)).toEqual(["Closed a slow-down notice the page put in the way"]);
  });

  it("says several layers in one row", async () => {
    await inRun(answering({ clearedLayers: [{ kind: "consent", control: "Reject" }, { kind: "dialog", control: "Close" }] }));
    expect(interferenceRows().map((event) => event.detail?.recovery?.subject)).toEqual(["Closed 2 notices the page put in the way"]);
  });

  it.each<[string, JsonValue]>([
    ["no field", { status: "succeeded" }],
    ["an empty list", { clearedLayers: [] }],
    ["only unknown kinds", { clearedLayers: [{ kind: "robot_check", control: "Close" }] }],
    ["the field nested in the client's own result", { result: { clearedLayers: [{ kind: "dialog", control: "Close" }] } }]
  ])("keeps and says nothing for %s", async (_name, payload) => {
    const trace = await inRun(answering(payload));
    expect(trace.attempts[0]).not.toHaveProperty("clearedLayers");
    expect(interferenceRows()).toEqual([]);
  });
});
