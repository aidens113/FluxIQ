import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../executor/index.ts";
import { automationStudioRunDetailAttemptsInRunOrder, flowRunSummaryWithInterventionSummaries, runtimeSessionToFlowRunDetail, runtimeSummaryFromSession } from "../index.ts";

// Run rmx-2026-10-10T06-59-14-650Z-30bb9a (t404, recovery matrix row 3): the
// run detail carried only the root frame's attempts, so nothing a called part
// did reached the run detail, the stored events, a judge or the run log.

const ROOT = ["invocation-1"];
const PART = ["invocation-1", "invocation-2"];
const INNER = ["invocation-1", "invocation-2", "invocation-3"];

describe("runtimeSessionToFlowRunDetail with a two-level Call Subflow", () => {
  it("places each part's attempts after the call that ran them, with their frame paths, entry and lifecycle", () => {
    const detail = runtimeSessionToFlowRunDetail(session(twoLevelRun()), "project.frames");
    const rows = detail.actionAttempts ?? [];

    expect(rows.map((row) => [row.attemptId, row.parentAttemptId, row.order])).toEqual([
      ["open.attempt.1", undefined, 1],
      ["call.attempt.1", undefined, 2],
      ["call.attempt.1:type.attempt.1", "call.attempt.1", 3],
      ["call.attempt.1:inner.attempt.1", "call.attempt.1", 4],
      ["call.attempt.1:inner.attempt.1:type.attempt.1", "call.attempt.1:inner.attempt.1", 5],
      ["call.attempt.1:inner.attempt.1:type.attempt.2", "call.attempt.1:inner.attempt.1", 6],
      ["call.attempt.1:read.attempt.1", "call.attempt.1", 7],
      ["done.attempt.1", undefined, 8]
    ]);
    expect(rows.map((row) => row.framePath)).toEqual([ROOT, ROOT, PART, PART, INNER, INNER, PART, ROOT]);

    const byId = new Map(rows.map((row) => [row.attemptId, row]));
    expect(byId.get("call.attempt.1")).toMatchObject({ subflowTarget: { subflowId: "part.search", graphFlowId: "flow.frames.sub.search", graphRevision: 2 } });
    expect(byId.get("call.attempt.1:inner.attempt.1")).toMatchObject({ subflowTarget: { subflowId: "part.filter", graphFlowId: "flow.frames.sub.filter", graphRevision: null } });
    expect(byId.get("call.attempt.1:type.attempt.1")).toMatchObject({ nodeId: "type", entry: { kind: "entry", id: "entry.search", evidence: [{ truth: "true", capturedAt: 21 }] }, metadata: { traceAttemptId: "type.attempt.1" } });
    expect(byId.get("call.attempt.1:inner.attempt.1:type.attempt.1")).toMatchObject({
      status: "failed",
      failureClass: "retry",
      entry: { kind: "default", evidence: [] },
      lifecycle: { event: "before", handlerId: "handler.consent", occurrence: "occ.1", disposition: { kind: "resolve" }, completionCheck: "true" }
    });
    expect(byId.get("call.attempt.1:read.attempt.1")).toMatchObject({ stateRouting: { outcome: "unobserved" } });
    // A root-frame row keeps its trace's own id, so it carries no trace id of its own.
    expect(byId.get("open.attempt.1")?.metadata).not.toHaveProperty("traceAttemptId");
    expect(byId.get("open.attempt.1")).not.toHaveProperty("parentAttemptId");
  });

  it("counts every attempt that did work and no container, wherever the count is taken", () => {
    const run = session(twoLevelRun());
    const detail = runtimeSessionToFlowRunDetail(run, "project.frames");

    // Eight rows: the two calls are containers, so six steps.
    expect(detail.actionAttempts).toHaveLength(8);
    expect(detail.summary.actionAttemptCount).toBe(6);
    expect(runtimeSummaryFromSession(run).attemptCount).toBe(6);
    const summary = flowRunSummaryWithInterventionSummaries(detail);
    expect(summary.actionAttemptCount).toBe(6);
    // The action pages are told how many records they hold.
    expect(summary.metadata?.actionRecordCount).toBe(8);
  });

  it("gives the same part called twice distinct ids", () => {
    const part = () => [traced("type.attempt.1", { framePath: PART, startedAt: 21 })];
    const detail = runtimeSessionToFlowRunDetail(session([
      traced("first.attempt.1", { framePath: ROOT, startedAt: 20, subflowTarget: target("part.search", 2), childTrace: trace(part()) }),
      traced("second.attempt.1", { framePath: ROOT, startedAt: 40, subflowTarget: target("part.search", 2), childTrace: trace(part()) })
    ]), "project.frames");

    expect(detail.actionAttempts?.map((row) => row.attemptId)).toEqual(["first.attempt.1", "first.attempt.1:type.attempt.1", "second.attempt.1", "second.attempt.1:type.attempt.1"]);
  });

  it("counts a call that ran no part as a step of its own", () => {
    const detail = runtimeSessionToFlowRunDetail(session([
      traced("call.attempt.1", { framePath: ROOT, status: "failed", subflowTarget: target("part.search", 2), childTrace: trace([]) }),
      traced("refused.attempt.1", { framePath: ROOT, status: "failed" })
    ]), "project.frames");

    expect(detail.actionAttempts).toHaveLength(2);
    expect(detail.summary.actionAttemptCount).toBe(2);
    expect(flowRunSummaryWithInterventionSummaries(detail).metadata).not.toHaveProperty("actionRecordCount");
  });

  it("leaves a Call Flow attempt's child run unprojected, as before", () => {
    const callFlow = traced("publish.attempt.1", { startedAt: 20, compositeTarget: { flowId: "flow.published", version: "1", flowDigest: "sha256:d" }, childTrace: trace([traced("inside.attempt.1", { startedAt: 21 })]) });
    const detail = runtimeSessionToFlowRunDetail(session([callFlow]), "project.frames");

    expect(detail.actionAttempts?.map((row) => row.attemptId)).toEqual(["publish.attempt.1"]);
    expect(detail.summary.actionAttemptCount).toBe(1);
  });
});

describe("runtimeSessionToFlowRunDetail without Call Subflow", () => {
  it("projects the root frame's attempts exactly as before: their own ids, in order, nothing added", () => {
    const attempts = [traced("open.attempt.1", { startedAt: 10 }), traced("type.attempt.1", { startedAt: 20, status: "failed" }), traced("type.attempt.2", { startedAt: 30 })];
    const run = session(attempts);
    const detail = runtimeSessionToFlowRunDetail(run, "project.frames");

    expect(detail.actionAttempts?.map((row) => [row.attemptId, row.nodeId, row.order, row.status])).toEqual([
      ["open.attempt.1", "open", 1, "succeeded"],
      ["type.attempt.1", "type", 2, "failed"],
      ["type.attempt.2", "type", 3, "succeeded"]
    ]);
    for (const row of detail.actionAttempts ?? []) {
      expect(row).not.toHaveProperty("parentAttemptId");
      expect(row).not.toHaveProperty("subflowTarget");
      expect(row.metadata).not.toHaveProperty("traceAttemptId");
    }
    expect(detail.summary.actionAttemptCount).toBe(3);
    expect(runtimeSummaryFromSession(run).attemptCount).toBe(3);
    const summary = flowRunSummaryWithInterventionSummaries(detail);
    expect(summary.actionAttemptCount).toBe(3);
    expect(summary).not.toHaveProperty("metadata.actionRecordCount");
  });
});

describe("automationStudioRunDetailAttemptsInRunOrder", () => {
  it("keeps every id within the run detail store's 200 characters, however deep the parts nest", () => {
    const long = "n".repeat(90);
    const deepest = [traced(`${long}.attempt.1`, {})];
    const middle = [traced(`${long}.attempt.1`, { subflowTarget: target("part.inner", 1), childTrace: trace(deepest) })];
    const placed = automationStudioRunDetailAttemptsInRunOrder([traced(`${long}.attempt.1`, { subflowTarget: target("part.outer", 1), childTrace: trace(middle) })]);

    expect(placed).toHaveLength(3);
    expect(new Set(placed.map((item) => item.attemptId)).size).toBe(3);
    for (const item of placed) expect(item.attemptId.length).toBeLessThanOrEqual(200);
    expect(placed[2]?.parentAttemptId).toBe(placed[1]?.attemptId);
  });
});

function twoLevelRun(): AutomationStudioNodeAttemptTrace[] {
  const inner = [
    traced("type.attempt.1", {
      framePath: INNER, startedAt: 31, status: "failed", failureClass: "retry",
      entry: { kind: "default", evidence: [] },
      lifecycle: { event: "before", handlerId: "handler.consent", occurrence: "occ.1", conditionEvidence: [{ truth: "true", capturedAt: 31 }], disposition: { kind: "resolve" }, completionCheck: "true" }
    }),
    traced("type.attempt.2", { framePath: INNER, startedAt: 35 })
  ];
  const part = [
    traced("type.attempt.1", { framePath: PART, startedAt: 21, entry: { kind: "entry", id: "entry.search", evidence: [{ truth: "true", capturedAt: 21 }] } }),
    traced("inner.attempt.1", { framePath: PART, startedAt: 30, subflowTarget: { subflowId: "part.filter", graphFlowId: "flow.frames.sub.filter", graphRevision: null }, childTrace: trace(inner) }),
    traced("read.attempt.1", { framePath: PART, startedAt: 50, stateRouting: { outcome: "unobserved" } })
  ];
  return [
    traced("open.attempt.1", { framePath: ROOT, startedAt: 10, entry: { kind: "default", evidence: [] } }),
    traced("call.attempt.1", { framePath: ROOT, startedAt: 20, subflowTarget: target("part.search", 2), childTrace: trace(part) }),
    traced("done.attempt.1", { framePath: ROOT, startedAt: 70 })
  ];
}

function target(subflowId: string, graphRevision: number | null): NonNullable<AutomationStudioNodeAttemptTrace["subflowTarget"]> {
  return { subflowId, graphFlowId: `flow.frames.sub.${subflowId.split(".")[1]}`, graphRevision };
}

function traced(attemptId: string, fields: Record<string, unknown>): AutomationStudioNodeAttemptTrace {
  const startedAt = typeof fields.startedAt === "number" ? fields.startedAt : 10;
  return {
    attemptId,
    nodeId: attemptId.split(".attempt.")[0]!,
    definitionId: "builtin.policy.action",
    startedAt,
    finishedAt: startedAt + 2,
    status: "succeeded",
    inputs: {},
    outputs: {},
    effects: [],
    ...fields
  } as unknown as AutomationStudioNodeAttemptTrace;
}

function trace(attempts: AutomationStudioNodeAttemptTrace[]): NonNullable<AutomationStudioNodeAttemptTrace["childTrace"]> {
  return { status: "succeeded", startedAt: 1, finishedAt: 2, attempts, values: {}, effects: [] };
}

function session(attempts: AutomationStudioNodeAttemptTrace[]): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1",
    runId: "run.frames",
    projectId: "project.frames",
    targetKind: "flow",
    targetId: "flow.frames",
    flowId: "flow.frames",
    status: "succeeded",
    queuedAt: 1,
    startedAt: 5,
    finishedAt: 90,
    flow: {} as AutomationStudioFlowDocument,
    trace: { status: "succeeded", startedAt: 5, finishedAt: 90, attempts, values: {}, effects: [] }
  };
}
