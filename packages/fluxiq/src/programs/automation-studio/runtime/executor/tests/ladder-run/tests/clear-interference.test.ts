// The `clear_interference` rung fed by the client's obstruction (P6, CC7,
// t799): a dispatch that failed because a layer stood over the page reports
// the layer and its ways out at `outputs.result.obstruction`; the ladder
// presses a non-committing way out as a transient press that is no node of the
// Flow, waits for the node's state, and attempts the node again
// (`../../../ladder-run.ts`, `../../../recovery-ladder.ts`).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../nodes/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../../../index.ts";

const BLOCKED_FAILURE = { category: "unexpected_state" as const, code: "web.action.blocked_by_dialog", retryable: false, stage: "execution" as const };
const TIMEOUT_FAILURE = { category: "timeout" as const, code: "web.action.timeout", retryable: true, stage: "execution" as const };

/** The domain's press definition, run by the host's native runtime (an example library site's notice). */
const PRESS = "test.output.press";
const CLOSE_REF: JsonObject = { selector: "button.not-now", element: { tagName: "button", accessibleName: "Not now" } }; // the parameters the press runs with, as the domain resolved them
const ACCEPT_REF: JsonObject = { selector: "button.join", element: { tagName: "button", accessibleName: "Join the reading club" } };

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

function actionNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, ...parameterValues }, ...(metadata ? { metadata } : {}) };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.clear-interference", ownerKind: "routine", ownerId: "routine.test", name: "Clear interference", createdAt: 1, updatedAt: 1, nodes, edges };
}

const obstructionWith = (dismiss: JsonValue[], extra: JsonObject = {}): JsonObject => ({ id: "layer.reading-club", name: "Join the reading club", kind: "overlay", dismiss, ...extra });

/** Fails `act` with `failure` and the obstruction for its first `failures` dispatches, then lets it through. */
function coveredDispatcher(obstruction: JsonObject | undefined, failure: AutomationNodeExecutionResult["failure"], failures: number, dispatches: string[]): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  let failed = 0;
  return (effect) => {
    const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
    dispatches.push(outputId);
    if (outputId === "output.act" && failed < failures) {
      failed += 1;
      return { status: "failed", route: "failed", outputs: { ok: false, ...(obstruction ? { result: { status: "failed", obstruction } } : {}) }, message: "A layer covered the control.", ...(failure ? { failure } : {}) };
    }
    return { status: "success", route: "success", outputs: { ok: true } };
  };
}

type Pressed = { node: AutomationStudioFlowNode };

function pressHost(pressed: Pressed[], answer: AutomationNodeExecutionResult = { status: "success", route: "success", outputs: {} }): NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]> {
  return async (request) => {
    pressed.push({ node: structuredClone(request.node) });
    return { result: answer };
  };
}

async function inRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, allowLlmDiagnosis: false, ...options }));
}

const interferenceRows = () => seen.filter((event) => event.detail?.recovery?.kind === "interference");

describe("a step covered by a layer the client reported, with a way out to press", () => {
  it("presses the dismissing way out as a transient press, then attempts the step again, for a failure that is not retryable", async () => {
    const dispatches: string[] = [];
    const pressed: Pressed[] = [];
    const flow = flowOf([actionNode("act"), actionNode("after")], [{ id: "e", sourceNodeId: "act", targetNodeId: "after", sourcePortId: "success" }]);
    const nodesBefore = structuredClone(flow.nodes);
    const obstruction = obstructionWith([{ intent: "accept", definitionId: PRESS, controlRef: ACCEPT_REF }, { intent: "dismiss", definitionId: PRESS, controlRef: CLOSE_REF }]);
    const trace = await inRun(flow, { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, dispatches), nativeNodeExecutor: pressHost(pressed) });

    expect(trace.status).toBe("succeeded");
    expect(dispatches).toEqual(["output.act", "output.act", "output.after"]);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.node).toMatchObject({ definitionId: PRESS, parameterValues: CLOSE_REF, metadata: { declaredConsequences: [] } });
    expect(flow.nodes.map((node) => node.id)).not.toContain(pressed[0]!.node.id);
    expect(flow.nodes).toEqual(nodesBefore);
    expect(trace.attempts[0]).toMatchObject({ nodeId: "act", status: "failed", obstruction: { kind: "overlay", id: "layer.reading-club" } });
    expect(trace.attempts[0]?.recoveryDecision?.metadata?.ladderConsumed).toContain("clear_interference");
    expect(trace.attempts[1]).toMatchObject({ nodeId: pressed[0]!.node.id, status: "succeeded" });
    expect(trace.attempts[2]).toMatchObject({ nodeId: "act", status: "succeeded" });
  });

  it("says the press as one interference recovery row about the step, in generic words", async () => {
    const flow = flowOf([actionNode("act")]);
    const obstruction = obstructionWith([{ intent: "dismiss", definitionId: PRESS, controlRef: CLOSE_REF }]);
    await inRun(flow, { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, []), nativeNodeExecutor: pressHost([]) });

    const rows = interferenceRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ detail: { kind: "step", ref: "act", status: "succeeded", recovery: { kind: "interference", outcome: "succeeded", subject: "Closed something the page put over itself" } } });
    expect(JSON.stringify(rows)).not.toContain("reading club");
  });

  it("presses a neutral way out when the layer offers no dismissing one, and never the accepting one", async () => {
    const pressed: Pressed[] = [];
    const neutralRef: JsonObject = { selector: "button.later" };
    const obstruction = obstructionWith([{ intent: "accept", definitionId: PRESS, controlRef: ACCEPT_REF }, { intent: "neutral", definitionId: PRESS, controlRef: neutralRef }]);
    await inRun(flowOf([actionNode("act")]), { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, []), nativeNodeExecutor: pressHost(pressed) });

    expect(pressed.map((press) => press.node.parameterValues)).toEqual([neutralRef]);
  });

  it("is not offered when the only way out accepts what the layer asks", async () => {
    const dispatches: string[] = [];
    const pressed: Pressed[] = [];
    const obstruction = obstructionWith([{ intent: "accept", definitionId: PRESS, controlRef: ACCEPT_REF }]);
    const trace = await inRun(flowOf([actionNode("act")]), { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, dispatches), nativeNodeExecutor: pressHost(pressed) });

    expect(pressed).toEqual([]);
    expect(dispatches).toEqual(["output.act"]);
    expect(trace.attempts[0]?.recoveryDecision?.candidates.map((candidate) => candidate.kind)).not.toContain("clear_interference");
  });

  it("waits for the state the step expects after the press, before attempting it again", async () => {
    const asked: string[] = [];
    const flow = flowOf([actionNode("act", { readyState: { conditions: [{ path: "page.ready" }] } })]);
    const obstruction = obstructionWith([{ intent: "dismiss", definitionId: PRESS, controlRef: CLOSE_REF }]);
    const press = pressHost([]);
    await inRun(flow, {
      effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, []),
      nativeNodeExecutor: async (request) => {
        asked.push(`press:${request.node.definitionId}`);
        return await press(request);
      },
      hostRuntime: {
        capabilities: ["expectation-evaluation"],
        expectationEvaluator: (_conditions, _mode, _timeoutMs, context) => {
          asked.push(`wait:${context.nodeId ?? ""}`);
          return { passed: true, checkedConditionCount: 1 };
        }
      }
    });

    // Readiness held before the first attempt, so the await rung is not offered; the wait after the press is the rung's.
    expect(asked.slice(0, 3)).toEqual(["wait:act", "press:test.output.press", "wait:act"]);
  });

  it("goes on down the ladder when the press fails, and does not press again", async () => {
    const dispatches: string[] = [];
    const pressed: Pressed[] = [];
    const obstruction = obstructionWith([{ intent: "dismiss", definitionId: PRESS, controlRef: CLOSE_REF }]);
    const trace = await inRun(flowOf([actionNode("act")]), {
      effectDispatcher: coveredDispatcher(obstruction, TIMEOUT_FAILURE, 1, dispatches),
      nativeNodeExecutor: pressHost(pressed, { status: "failed", route: "failed", outputs: {}, message: "The control was gone.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution" } })
    });

    expect(pressed).toHaveLength(1);
    expect(dispatches).toEqual(["output.act", "output.act"]);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.recoveryDecision?.selected?.kind).toBe("retry_node");
    expect(trace.attempts[0]?.recoveryDecision?.metadata?.ladderConsumed).toContain("clear_interference");
    expect(interferenceRows()).toEqual([expect.objectContaining({ detail: expect.objectContaining({ ref: "act", recovery: expect.objectContaining({ outcome: "failed" }) }) })]);
  });

  it("is not offered for a step that may not be dispatched again", async () => {
    const pressed: Pressed[] = [];
    const obstruction = obstructionWith([{ intent: "dismiss", definitionId: PRESS, controlRef: CLOSE_REF }]);
    const trace = await inRun(flowOf([actionNode("act", {}, { destructive: true })]), { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, []), nativeNodeExecutor: pressHost(pressed) });

    expect(pressed).toEqual([]);
    expect(trace.attempts[0]?.recoveryDecision?.candidates.map((candidate) => candidate.kind) ?? []).not.toContain("clear_interference");
  });

  it("presses the browser's own back when that is the way out, with no target", async () => {
    const pressed: Pressed[] = [];
    const obstruction = obstructionWith([{ intent: "dismiss", definitionId: "test.output.back", action: "back" }]);
    await inRun(flowOf([actionNode("act")]), { effectDispatcher: coveredDispatcher(obstruction, BLOCKED_FAILURE, 1, []), nativeNodeExecutor: pressHost(pressed) });

    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.node.definitionId).toBe("test.output.back");
    expect(pressed[0]!.node.parameterValues ?? {}).not.toHaveProperty("selector");
  });
});

describe("a failure that reports no obstruction", () => {
  it("offers no interference rung, as before", async () => {
    const dispatches: string[] = [];
    const pressed: Pressed[] = [];
    const trace = await inRun(flowOf([actionNode("act")]), { effectDispatcher: coveredDispatcher(undefined, BLOCKED_FAILURE, 1, dispatches), nativeNodeExecutor: pressHost(pressed) });

    expect(pressed).toEqual([]);
    expect(dispatches).toEqual(["output.act"]);
    expect(trace.attempts[0]).not.toHaveProperty("obstruction");
    expect(interferenceRows()).toEqual([]);
  });
});
