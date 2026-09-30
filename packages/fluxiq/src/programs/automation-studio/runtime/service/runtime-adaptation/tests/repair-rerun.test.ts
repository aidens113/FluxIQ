import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowDocument, type AutomationStudioFlowRunDetail, type AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { runtimeSessionToFlowRunDetail } from "../../summaries/index.ts";
import { recoveryBudgetFromRuntimeAdaptationContext } from "../context.ts";
import { rerunAutomationStudioSessionAfterRepair } from "../repair-rerun.ts";
import { resolveAutomationStudioRuntimeAdaptationContext } from "../resolve-context.ts";

// Live run `run-munv53gt-a0e6f545`, shrunk: the first pass pressed a one-time
// check and read the list; its answer was refuted and the Flow re-authored with
// the press optional. The re-run's session had already passed the check, so the
// press found nothing. It used to stop after three attempts at the press, and
// the store kept none of the re-run's first four attempts, whose ids repeated
// the first pass's.

const PROJECT_ID = "project.rerun";

const flow: AutomationStudioFlowArtifact = {
  ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.rerun", projectId: PROJECT_ID, name: "Re-authored", now: 1 }),
  nodes: [
    { id: "search", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "search" } } },
    { id: "check", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "soft-check" } } },
    { id: "join", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
    { id: "read", definitionId: "builtin.policy.action", parameterValues: { outputId: "activate-element", parameters: { elementId: "results" } } }
  ],
  edges: [
    { id: "search.check", sourceNodeId: "search", sourcePortId: "success", targetNodeId: "check", targetPortId: "in" },
    { id: "check.failed", sourceNodeId: "check", sourcePortId: "failed", targetNodeId: "join", targetPortId: "in" },
    { id: "check.success", sourceNodeId: "check", sourcePortId: "success", targetNodeId: "join", targetPortId: "branches" },
    { id: "join.read", sourceNodeId: "join", sourcePortId: "success", targetNodeId: "read", targetPortId: "in" }
  ]
};

/** The Flow as the run executes it. */
const flowDocument: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: flow.flowId, ownerKind: "routine", ownerId: flow.flowId, name: flow.name, createdAt: 1, updatedAt: 1, nodes: flow.nodes, edges: flow.edges };

const succeeds: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = () => ({ status: "success", route: "success", outputs: { ok: true } });

/** The session has already passed the check, so its button is gone; the host reports that as it did live. */
const checkPassed: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => JSON.stringify(effect.payload ?? null).includes("soft-check")
  ? { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } }
  : { status: "success", route: "success", outputs: { ok: true } };

async function adaptationContext() {
  return await resolveAutomationStudioRuntimeAdaptationContext({
    projectId: PROJECT_ID,
    flow,
    ports: {
      listFlowRunSummaries: async () => ({ runs: [] }),
      listFlowAdaptationSummaries: async () => ({ adaptations: [] }),
      getFlowAdaptation: async () => null,
      readResultCheckState: async () => null
    }
  });
}

async function refutedSession(): Promise<AutomationStudioRuntimeSession> {
  // Every step of the first pass succeeded; the answer was refuted afterwards.
  const firstPass = await runAutomationStudioGraph(flowDocument, { effectDispatcher: succeeds });
  return {
    schemaVersion: "0.1",
    runId: "run.rerun",
    projectId: PROJECT_ID,
    targetKind: "flow",
    targetId: flow.flowId,
    flowId: flow.flowId,
    status: "failed",
    queuedAt: 1,
    startedAt: 1,
    finishedAt: 2,
    flow: flowDocument,
    trace: { ...firstPass, status: "failed", message: "The result was judged not to answer the request." }
  };
}

async function rerun() {
  const context = await adaptationContext();
  const session = await refutedSession();
  const written: AutomationStudioRuntimeSession[] = [];
  const saved: AutomationStudioFlowRunDetail[] = [];
  const result = await rerunAutomationStudioSessionAfterRepair({
    ports: {
      getFlowSubflow: async () => null,
      getFlow: async () => flow,
      assertOwnedSubflowGraph: async () => undefined,
      listPublishedFlowSnapshots: async () => [],
      deprecatedPublicationIds: async () => [],
      writeRuntimeSession: async (_projectId, next) => { written.push(next); },
      saveFlowRunDetail: async (detail) => { saved.push(detail); }
    },
    projectId: PROJECT_ID,
    session,
    detail: runtimeSessionToFlowRunDetail(session, PROJECT_ID),
    graphOptions: { effectDispatcher: checkPassed, delay: async () => undefined, recoveryBudget: recoveryBudgetFromRuntimeAdaptationContext(context) },
    adaptationContext: context,
    from: "start"
  });
  return { context, session, result, written, saved };
}

describe("a repaired re-run of an optional press whose target is gone", () => {
  it("runs under the default recovery budget a Flow is created with", async () => {
    const context = await adaptationContext();

    expect(recoveryBudgetFromRuntimeAdaptationContext(context)).toMatchObject({ maxRetriesPerAction: 2, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 });
  });

  it("follows the press's failed route through the Merge and reaches the step after it", async () => {
    const { result } = await rerun();
    const trace = result?.session?.trace;

    expect(trace?.status).toBe("succeeded");
    const rerunAttempts = trace?.attempts.slice(4) ?? [];
    expect(rerunAttempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "check", "check", "join", "read"]);
    expect(rerunAttempts[3]?.recoveryDecision?.selected).toMatchObject({ kind: "deterministic_path", edgeId: "check.failed" });
  });

  it("numbers the re-run's attempts after the first pass's, so the run keeps every one of them", async () => {
    const { session, result, saved } = await rerun();
    const firstPassIds = session.trace?.attempts.map((attempt) => attempt.attemptId) ?? [];
    const keptIds = result?.session?.trace?.attempts.map((attempt) => attempt.attemptId) ?? [];

    expect(firstPassIds).toEqual(["search.attempt.1", "check.attempt.2", "join.attempt.3", "read.attempt.4"]);
    expect(keptIds.slice(4)).toEqual(["search.attempt.5", "check.attempt.6", "check.attempt.7", "check.attempt.8", "join.attempt.9", "read.attempt.10"]);
    expect(new Set(keptIds).size).toBe(keptIds.length);
    // The detail the store is handed carries every attempt under its own id,
    // which is what the store's write-once-per-id keeps.
    const detailIds = saved.at(-1)?.actionAttempts?.map((attempt) => attempt.attemptId) ?? [];
    expect(detailIds).toEqual(keptIds);
    expect(saved.at(-1)?.actionAttempts?.find((attempt) => attempt.attemptId === "check.attempt.6")?.status).toBe("failed");
  });
});
