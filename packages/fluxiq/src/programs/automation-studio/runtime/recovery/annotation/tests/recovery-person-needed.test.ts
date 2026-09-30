// A recovery that meets a check only a person can complete while exploring
// puts it to the person through the run's thread and never to a model. When
// the person does not get past it, the recovery ends there: no re-plan and no
// patch call. When they do, the recovery goes on, and the patch is shown the
// page as it was after the person rather than the check.
//
// Driven through `annotateAutomationStudioRunDetailWithRuntimeLlm` with a
// stand-in domain whose press meets a check the way the web domain reports one
// (`personNeeded`), a scripted provider, and a stand-in thread bound as the
// run's parking port.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import type { AutomationStudioHarnessOptionBundle, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../parking/index.ts";
import { resolveAutomationStudioResultCheckSchedule } from "../../../result-check-schedule/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../../service.ts";
import { annotateAutomationStudioRunDetailWithRuntimeLlm } from "../annotate.ts";

const CHECK_MARKER = "ROBOT_CHECK_ON_THIS_PAGE";
const FAILURE_PAGE: JsonObject = { schemaVersion: "test.page.v1", page: "page.failed", controls: ["Continue to the list"] };

type Answer = "done" | "stop" | "nobody" | "no_port";

type Recovery = {
  detail: AutomationStudioFlowRunDetail;
  taskKinds: string[];
  /** Every request a model was sent, serialized. */
  sent: string[];
  /** The explored packets the patch request carried, when one was made. */
  patchPackets?: unknown;
  opened: AutomationStudioAsk[];
};

describe("a recovery exploration that meets a check only a person can complete", () => {
  it.each([
    ["Stop", "stop" as Answer, "person_needed.stopped"],
    ["nobody answering", "nobody" as Answer, "person_needed.timed_out"],
    ["no thread to ask in", "no_port" as Answer, "person_needed.no_thread"]
  ])("ends the recovery person-needed on %s, with no patch call and nothing of the check shown", async (_name, answer, code) => {
    const run = await recover(answer);

    expect(run.opened).toHaveLength(answer === "no_port" ? 0 : 1);
    if (answer !== "no_port") expect(run.opened[0]).toMatchObject({ control: { kind: "person_check" }, raisedBy: { stage: "recovery" } });
    // The diagnosis, then the one decision that chose the press. No second
    // decision, no re-plan, no patch.
    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision"]);
    expect(run.sent.join("\n")).not.toContain(CHECK_MARKER);
    expect(run.detail.metadata?.llmGate).toMatchObject({
      patchSkippedCode: "llm.runtime_patch_person_needed",
      patchSkippedRung: "exploration",
      personNeeded: { asks: 1, ended: code }
    });
    expect(run.detail.metadata).not.toHaveProperty("runtimePatchAttempts");
    expect(run.detail.metadata).not.toHaveProperty("permissionRequest");
    expect(run.detail.adaptationIds).toEqual([]);
    expect(stage(run.detail, "exploration")).toMatchObject({ status: "refused", detail: { outcome: "user_intervention_required", endedBy: code, personNeeded: { asks: 1, ended: code } } });
  });

  it("goes on after Continue, and the patch is shown the fresh look instead of the check", async () => {
    const run = await recover("done");

    expect(run.opened).toHaveLength(1);
    expect(run.taskKinds).toEqual(["runtime_diagnosis", "evidence_tool_decision", "evidence_tool_decision", "runtime_patch"]);
    expect(run.sent.join("\n")).not.toContain(CHECK_MARKER);
    expect(JSON.stringify(run.patchPackets)).toContain("page.after-person");
    expect(run.detail.metadata?.llmGate).toMatchObject({ personNeeded: { asks: 1 } });
    expect((run.detail.metadata?.llmGate as JsonObject).patchSkippedCode).toBeUndefined();
    expect(stage(run.detail, "exploration")).toMatchObject({ detail: { outcome: "evidence_gathered", personNeeded: { asks: 1 } } });
  });
});

function thread(answer: Answer): { port?: AutomationStudioParkingPort; opened: AutomationStudioAsk[] } {
  const opened: AutomationStudioAsk[] = [];
  if (answer === "no_port") return { opened };
  return {
    opened,
    port: {
      open: (ask) => { opened.push(ask); },
      awaitAnswer: async (ask): Promise<AutomationStudioAskAnswer | undefined> => answer === "nobody"
        ? undefined
        : { askId: ask.askId, kind: "choice", value: answer === "done" ? "person_done" : "person_stop", answeredAt: 1_000, actorId: "person.one" }
    }
  };
}

async function recover(answer: Answer): Promise<Recovery> {
  const asks = thread(answer);
  const run: Recovery = { detail: runDetail(), taskKinds: [], sent: [], opened: asks.opened };
  const provider: AutomationStudioLlmProvider = {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async (request: AutomationStudioLlmTaskRequest) => {
      run.taskKinds.push(request.taskKind);
      run.sent.push(JSON.stringify(request));
      if (request.expectedOutput === "diagnosis") {
        return { response: { kind: "diagnosis", summary: "The list is behind a control.", diagnosis: { explorationNeeded: true, patchNeeded: true } } };
      }
      if (request.expectedOutput === "evidence_tool_decision") {
        const decision = request.context.evidenceLoop?.iteration === 1
          ? { kind: "tool_call" as const, callId: "call.press", toolId: "test.press", input: {} }
          : { kind: "complete" as const, result: { findings: "Continue to the list opens the list." } };
        return { response: { kind: "evidence_tool_decision", summary: "Trying the control.", decision } };
      }
      run.patchPackets = request.context.explorationEvidence?.packets;
      return { response: { kind: "no_repair", summary: "Nothing to change.", reason: "control_gone" } };
    }
  };
  run.detail = await annotateAutomationStudioRunDetailWithRuntimeLlm({
    ports: {
      resolveLlmProvider: () => ({ provider, maxCallsPerRun: 6 }),
      llmEvidenceRuntime: {
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [],
        harnessOptions: options(),
        executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); },
        captureSanitizedFailureEvidence: async () => FAILURE_PAGE
      },
      reusableLlmContextEnabled: false,
      flowInstructionSet: async () => [],
      reusableLlmContextForFreshEvidence: async () => undefined,
      flowForRecovery: async () => ({ scope: { kind: "domain", domainId: "test.domain" } }),
      saveFlowChangeProposal: async (proposal) => proposal,
      saveFlowAdaptation: async (adaptation) => adaptation,
      promoteRuntimeAdaptation: async (input) => input.adaptation
    },
    detail: runDetail(),
    context: context(),
    runtimeFlow: { schemaVersion: "0.1", flowId: "flow.recovery", ownerKind: "policy", ownerId: "project.recovery", name: "Recovery flow", nodes: [{ id: "node.action", definitionId: "builtin.policy.action" }], edges: [], createdAt: 1, updatedAt: 1 },
    failedTraceAttempt: { attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 2, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], message: "The action failed.", failure: { category: "target_not_found", code: "test.target_not_found", retryable: false } },
    ...(asks.port ? { graphOptions: { parking: asks.port } } : {}),
    llmExecution: { actorUserId: "user.test", actorSessionId: "session.test", intent: "explore_and_adapt" }
  });
  return run;
}

/** A look that is also the free first look, and a press that meets a check the first time it is pressed. */
function options(): AutomationStudioHarnessOptionBundle {
  let pressed = 0;
  let looks = 0;
  const option = (toolId: string, effect: "observe" | "mutate") => ({
    toolId,
    description: `Run ${toolId}.`,
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
    effect,
    ...(effect === "observe" ? { initialObservation: { input: {} } } : {}),
    availability: { kind: "domain" as const, domainId: "test.domain" },
    safety: { sideEffect: effect },
    stages: ["gather" as const, "iterate" as const]
  });
  return {
    schemaVersion: "0.1",
    domainId: "test.domain",
    options: [option("test.look", "observe"), option("test.press", "mutate")],
    implementations: {
      "test.look": async () => {
        looks += 1;
        return { kind: "llm_evidence_tool_execution", evidence: looks === 1 ? FAILURE_PAGE : { schemaVersion: "test.page.v1", page: "page.after-person", controls: ["Open the list"] }, effectApplied: false };
      },
      "test.press": async () => {
        pressed += 1;
        if (pressed === 1) {
          return { kind: "llm_evidence_tool_execution", evidence: { schemaVersion: "test.page.v1", ok: false, code: "needs_person", page: CHECK_MARKER }, effectApplied: true, resultCode: "test.needs_person", personNeeded: true };
        }
        return { kind: "llm_evidence_tool_execution", evidence: { schemaVersion: "test.page.v1", page: "page.list" }, effectApplied: true };
      }
    }
  };
}

function stage(detail: AutomationStudioFlowRunDetail, name: string): JsonObject | undefined {
  return (detail.metadata?.recoveryTrace as { stages?: JsonObject[] } | undefined)?.stages?.find((entry) => entry.stage === name);
}

function context(): AutomationStudioRuntimeAdaptationContext {
  return {
    projectId: "project.recovery",
    flowId: "flow.recovery",
    settings: {
      mode: "continuous_adaptive",
      allowLlmIntervention: true,
      allowRuntimeRecovery: true,
      allowAdaptationCreation: true,
      proposalApprovalMode: "auto",
      allowPromotion: true,
      budgets: { maxTokensPerRun: 200_000, exhaustedBehavior: "stop" }
    },
    policy: policy(),
    behavior: { invokeLlm: true, runRecovery: true, createAdaptations: true, proposalApprovalMode: "auto", promoteAdaptations: false },
    metrics: { deterministicSuccessRuns: 0, llmInterventionsPerRun: 0, unresolvedFailures: 1, repeatedTriggers: [], acceptedAdaptations: 0, rejectedAdaptations: 0, stabilityScore: 0.5 },
    budgetState: { interventionsThisRun: 0, tokensThisRun: 0, costUsdThisTrainingWindow: 0 },
    budgetDecision: { ok: true, exhausted: [], behavior: "continue" },
    runsCompleted: 3,
    recentRunCount: 3,
    recentAdaptationCount: 0,
    recentAdaptations: [],
    resultCheckSchedule: resolveAutomationStudioResultCheckSchedule("initial_then_exponential"),
    resultCheckState: { ordinal: 1, lastCheckedOrdinal: null, checksPassed: 0, lastStatus: null },
    resultCheckEpoch: 1,
    diagnostics: []
  };
}

function policy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.recovery",
    scope: { kind: "flow", flowId: "flow.recovery" },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    createdAt: 1,
    updatedAt: 1
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: {
      schemaVersion: "0.1",
      runId: "run.failed",
      flowId: "flow.recovery",
      projectId: "project.recovery",
      status: "failed",
      updatedAt: 1_000,
      routeDecisionCount: 0,
      subflowEntryCount: 0,
      actionAttemptCount: 1,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    actionAttempts: [{ attemptId: "node.action.attempt.1", nodeId: "node.action", definitionId: "builtin.policy.action", order: 1, status: "failed", startedAt: 1, finishedAt: 2 }],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
