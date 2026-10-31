// A run learns a pace from a rate limit that came without a wait hint, on the
// failure path and on the path of a step that went through after the client
// closed a slow-down notice (P6, CC8, t799), and a step the `clear_interference`
// rung clears and retries shows no "Didn't work" card (w1's finding, t774).
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const edge = (sourceNodeId: string, targetNodeId: string, sourcePortId = "success") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId: "in" });
const action = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}` } });
const flowOf = (nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument =>
  ({ schemaVersion: "0.1", flowId: "flow.rate-limit-pace", ownerKind: "routine", ownerId: "routine.test", name: "Rate limit pace", createdAt: 1, updatedAt: 1, nodes, edges });

/** The page refused the act as too fast and named no wait. */
const RATE_LIMITED = { category: "timeout" as const, code: "web.action.rate_limited", retryable: true, stage: "execution" as const, effect: "unacted" as const };

async function inRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, allowLlmDiagnosis: false, ...options }));
}

/** Refuses the first dispatch of `act` as too fast, with `result` beside it, then lets everything through. */
function refusedOnce(result: JsonObject | undefined): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  let refused = false;
  return () => {
    if (refused) return { status: "success", route: "success", outputs: { ok: true } };
    refused = true;
    return { status: "failed", route: "failed", outputs: { ok: false, ...(result ? { result } : {}) }, message: "The page asked the run to slow down.", failure: RATE_LIMITED };
  };
}

describe("a failed attempt that met a rate limit with no wait hint", () => {
  it("raises its node's pace to a second and says so on the attempt", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: refusedOnce({ status: "failed", obstruction: { kind: "rate_limit", dismiss: [] } }) });

    expect(trace.attempts[0]).toMatchObject({ nodeId: "act", status: "failed", obstruction: { kind: "rate_limit" }, pace: { raisedToMs: 1_000 } });
    expect(trace.pace).toEqual([expect.objectContaining({ nodeId: "act", paceMs: 1_000, learnedMs: 1_000, raisedCount: 1 })]);
  });

  it("takes a stated retryAfterMs as a hint, as a transport's Retry-After is", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: refusedOnce({ status: "failed", obstruction: { kind: "rate_limit", retryAfterMs: 8_000, dismiss: [] } }) });

    expect(trace.attempts[0]?.pace?.raisedToMs).toBe(8_000);
  });

  it("changes nothing for a refusal that shows no rate limit layer", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: refusedOnce(undefined) });

    expect(trace.attempts[0]?.pace).toBeUndefined();
    expect(trace.pace).toBeUndefined();
  });
});

describe("a step that went through after the client closed a slow-down notice", () => {
  const noticeClosed = (kind: string): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> => (effect) =>
    JSON.stringify(effect.payload ?? null).includes("output.act")
      ? { status: "success", route: "success", outputs: { ok: true, result: { status: "succeeded", clearedLayers: [{ kind, control: "Close" }] } } }
      : { status: "success", route: "success", outputs: { ok: true } };

  it("raises its pace to a second and records it on the attempt", async () => {
    const trace = await inRun(flowOf([action("act"), action("after")], [edge("act", "after")]), { effectDispatcher: noticeClosed("rate_limit") });

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]).toMatchObject({ nodeId: "act", status: "succeeded", pace: { raisedToMs: 1_000 } });
    expect(trace.attempts[1]?.pace).toBeUndefined();
    expect(trace.pace).toEqual([expect.objectContaining({ nodeId: "act", paceMs: 1_000, learnedMs: 1_000 })]);
  });

  it("leaves the pace alone when the layer it closed asked for no slowing down", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: noticeClosed("notice") });

    expect(trace.attempts[0]?.pace).toBeUndefined();
    expect(trace.pace).toBeUndefined();
  });
});

describe("a step the clear_interference rung clears and retries", () => {
  const PRESS = "test.output.press";
  const CLOSE: JsonObject = { handle: "h-close" };
  const covered = (): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> => {
    let failed = false;
    return () => {
      if (failed) return { status: "success", route: "success", outputs: { ok: true } };
      failed = true;
      return { status: "failed", route: "failed", outputs: { ok: false, result: { status: "failed", obstruction: { kind: "overlay", dismiss: [{ intent: "dismiss", definitionId: PRESS, controlRef: CLOSE }] } } },
        message: "A layer covered the control.", failure: { category: "unexpected_state", code: "web.action.blocked_by_dialog", retryable: false, stage: "execution" } };
    };
  };

  it("shows no failed card for the step, since it then works", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: covered(), nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) });

    expect(trace.status).toBe("succeeded");
    expect(seen.some((event) => event.detail?.kind === "step" && event.detail.status === "failed" && event.detail.ref === "act")).toBe(false);
    expect(seen.some((event) => event.label.startsWith("Recovering from a failed step"))).toBe(false);
  });

  it("still settles a step failed when nothing clears it", async () => {
    const trace = await inRun(flowOf([action("act")]), { effectDispatcher: covered(), nativeNodeExecutor: async () => ({ result: { status: "failed", route: "failed", outputs: {} } }) });

    expect(trace.status).toBe("failed");
    expect(seen.some((event) => event.label.startsWith("Recovering from a failed step"))).toBe(true);
  });
});
