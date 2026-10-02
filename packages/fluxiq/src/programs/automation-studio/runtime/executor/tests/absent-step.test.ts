// A sometimes-present step (a popup, a banner, a consent prompt) that is not on
// the page is skipped by observing the page, never reported as a failure: no
// "Recovery started", no retries (user, 2026-10-02; t174/w60). The route rows
// beside these are in `optional-failed-route.test.ts`.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions, type AutomationStudioGraphExecutionTrace } from "../index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const press = (id: string, elementId: string, extra: Partial<AutomationStudioFlowNode> = {}, parameters: Record<string, unknown> = {}): AutomationStudioFlowNode => ({
  id,
  definitionId: "builtin.policy.action",
  ...extra,
  parameterValues: { outputId: "activate-element", parameters: { elementId }, ...parameters } as NonNullable<AutomationStudioFlowNode["parameterValues"]>
});

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.absent-step", ownerKind: "routine", ownerId: "routine.test", name: "Absent step", createdAt: 1, updatedAt: 1, nodes, edges };
}

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

/** The optional shape a build writes: `failed` and `success` both enter one Merge. */
function optionalFlow(check: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return flowOf(
    [press("search", "search"), check, { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } }, press("read", "results")],
    [edge("search", "success", "check"), edge("check", "failed", "join"), { ...edge("check", "success", "join", "branches") }, edge("join", "success", "read")]
  );
}

/** The dialog's button is not there: the host's own report, after its wait. */
function absentDispatcher(calls: string[]): NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> {
  return (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    calls.push(payload.includes("not-now") ? "not-now" : "other");
    return payload.includes("not-now")
      ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
      : { status: "success", route: "success", outputs: { ok: true } };
  };
}

async function inRun(flow: AutomationStudioFlowDocument, options: AutomationStudioGraphExecutionOptions): Promise<AutomationStudioGraphExecutionTrace> {
  return await runWithAutomationStudioActivity({ kind: "run", id: "run.1", projectId: "project.1", flowId: flow.flowId }, () => runAutomationStudioGraph(flow, { delay: async () => undefined, ...options }));
}

const dismissal = press("check", "not-now", { label: "Close the offer" }, { element: { visibleText: "Not now" } });
const recoveryRows = () => seen.filter((event) => event.detail?.title === "Recovery started" || event.phase === "repairing");

describe("what a run says about a sometimes-present step that was not shown", () => {
  it("says the step was skipped because what it acts on was not shown, and never that recovery started", async () => {
    const calls: string[] = [];
    const trace = await inRun(optionalFlow(dismissal), { effectDispatcher: absentDispatcher(calls) });

    expect(trace.status).toBe("succeeded");
    expect(recoveryRows()).toEqual([]);
    const skipped = seen.filter((event) => event.detail?.kind === "step" && event.detail.ref === "check" && event.detail.status === "succeeded");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.detail!.title).toBe("Skipped “Not now”: it was not shown");
    expect(seen.some((event) => event.phase === "failed" || event.detail?.status === "failed")).toBe(false);
  });

  it("names the step by its authored label when it carries no control name", async () => {
    const labelled = press("check", "not-now", { label: "Close the offer" });
    await inRun(optionalFlow(labelled), { effectDispatcher: absentDispatcher([]) });

    const skipped = seen.find((event) => event.detail?.kind === "step" && event.detail.ref === "check" && event.detail.status === "succeeded");
    expect(skipped?.detail?.title).toBe("Skipped “Close the offer”: what it acts on was not shown");
  });

  it("still says recovery started for a straight-line step whose target is absent", async () => {
    const flow = flowOf([press("search", "search"), dismissal, press("read", "results")], [edge("search", "success", "check"), edge("check", "success", "read")]);
    await inRun(flow, { effectDispatcher: absentDispatcher([]) });

    expect(recoveryRows().length).toBeGreaterThan(0);
  });
});

describe("a step marked sometimes-present by its metadata", () => {
  it("is skipped down its success route when it has no Merge to join at", async () => {
    const marked = press("check", "not-now", { metadata: { sometimesPresent: true } });
    const flow = flowOf([press("search", "search"), marked, press("read", "results")], [edge("search", "success", "check"), edge("check", "success", "read")]);
    const calls: string[] = [];
    const trace = await inRun(flow, { effectDispatcher: absentDispatcher(calls) });

    expect(trace.status).toBe("succeeded");
    expect(calls.filter((call) => call === "not-now")).toHaveLength(1);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "read"]);
    expect(trace.attempts[1]).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent" } });
  });

  it("is not skipped when the marker is anything but true", async () => {
    const marked = press("check", "not-now", { metadata: { sometimesPresent: "yes" } });
    const flow = flowOf([press("search", "search"), marked, press("read", "results")], [edge("search", "success", "check"), edge("check", "success", "read")]);
    const trace = await inRun(flow, { effectDispatcher: absentDispatcher([]) });

    expect(trace.attempts.some((attempt) => attempt.skipped !== undefined)).toBe(false);
  });
});

describe("a sometimes-present step whose ready state is observed first", () => {
  const ready = (passed: boolean, checkedConditionCount: number): NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]> => ({
    capabilities: ["expectation-evaluation"],
    expectationEvaluator: () => ({ passed, checkedConditionCount, ...(passed ? {} : { message: "No dialog." }) })
  });
  const gated = press("check", "not-now", {}, { readyState: { conditions: [{ kind: "exists", selector: "[role=dialog]" }] } });

  it("is skipped with no dispatch at all when its ready state was checked and not met", async () => {
    const calls: string[] = [];
    const trace = await inRun(optionalFlow(gated), { effectDispatcher: absentDispatcher(calls), hostRuntime: ready(false, 1) });

    expect(trace.status).toBe("succeeded");
    expect(calls).not.toContain("not-now");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    const check = trace.attempts[1]!;
    expect(check).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "executor.ready_state.not_shown" }, readiness: { satisfied: false } });
    expect(check).not.toHaveProperty("failure");
    expect(check).not.toHaveProperty("recoveryDecision");
    expect(recoveryRows()).toEqual([]);
  });

  it("is pressed when its ready state is met", async () => {
    const calls: string[] = [];
    await inRun(optionalFlow(gated), { effectDispatcher: absentDispatcher(calls), hostRuntime: ready(true, 1) });

    expect(calls.filter((call) => call === "not-now")).toHaveLength(1);
  });

  it("is pressed when the gate judged nothing: a gate that could not look says nothing about the page", async () => {
    const calls: string[] = [];
    await inRun(optionalFlow(gated), { effectDispatcher: absentDispatcher(calls), hostRuntime: ready(false, 0) });

    expect(calls.filter((call) => call === "not-now")).toHaveLength(1);
  });

  it("is pressed anyway on a straight-line step, whose unmet ready state stays a mark", async () => {
    const flow = flowOf([press("search", "search"), gated, press("read", "results")], [edge("search", "success", "check"), edge("check", "success", "read")]);
    const calls: string[] = [];
    await inRun(flow, { effectDispatcher: absentDispatcher(calls), hostRuntime: ready(false, 1) });

    expect(calls).toContain("not-now");
  });
});
