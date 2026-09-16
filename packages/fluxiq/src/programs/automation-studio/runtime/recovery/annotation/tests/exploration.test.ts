import { describe, expect, it } from "vitest";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import {
  AutomationStudioLlmRunBudgetLedger,
  type AutomationStudioLlmEvidenceRuntimeBinding,
  type AutomationStudioLlmProvider
} from "../../../llm/index.ts";
import { buildAutomationStudioRuntimeRecoveryContext } from "../../context.ts";
import { resolveAutomationStudioExplorationBudget } from "../../exploration-budget.ts";
import { startAutomationStudioRecoveryDeadline } from "../../recovery-deadline.ts";
import { runAutomationStudioRecoveryExploration } from "../exploration.ts";

// Two things the recovery path has to carry into the runner and can silently
// fail to: the whole recovery's clock, and the domain's own reading of a
// refusal. Each is asserted by the outcome it produces, because each one
// missing leaves an exploration that simply ran on and reported something else.
describe("runAutomationStudioRecoveryExploration", () => {
  it("stops before the first provider call when the whole recovery is already out of time", async () => {
    const calls: string[] = [];
    const exploration = await runAutomationStudioRecoveryExploration({
      ...base(calls),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: 0, maxDurationMs: 1 }),
      now: () => 10_000
    });

    expect(calls).toEqual([]);
    expect(exploration).toMatchObject({
      outcome: "budget_exhausted",
      stopReason: "recovery_deadline_expired",
      endedBy: "recovery_deadline_expired",
      actions: 0
    });
    // The recovery needing longer and this exploration needing longer are
    // different advice, so they are never the same stop reason.
    expect(exploration.stopReason).not.toBe("wall_clock_expired");
  });

  it("ends in unsafe_action_blocked when the domain refuses what the model asked for", async () => {
    const calls: string[] = [];
    const exploration = await runAutomationStudioRecoveryExploration({
      ...base(calls, "test.refused.unsafe"),
      recoveryDeadline: startAutomationStudioRecoveryDeadline({ startedAtMs: Date.now() }),
      budget: resolveAutomationStudioExplorationBudget({ maxRefusedActions: 1 })
    });

    expect(calls).toEqual(["provider", "test.inspect"]);
    expect(exploration).toMatchObject({
      outcome: "unsafe_action_blocked",
      stopReason: "destructive_action_refused",
      refusedActions: 1,
      observedActions: 0
    });
    expect(exploration.result).toBeUndefined();
  });
});

function base(calls: string[], resultCode?: string) {
  const detail = runDetail();
  return {
    binding: binding(calls, resultCode),
    scope: { kind: "domain" as const, domainId: "test.domain" },
    policy: adaptationPolicy(),
    provider: provider(calls),
    context: { projectId: "project.recovery", flowId: "flow.recovery", runId: "run.failed" },
    instructions: [],
    runDetail: detail,
    recoveryContext: buildAutomationStudioRuntimeRecoveryContext({ detail }),
    runBudget: new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 4, maxTotalTokensPerRun: 200_000, maxOutputTokensPerRun: 100_000 }),
    maxEstimatedCostUsd: 0.05
  };
}

function provider(calls: string[]): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => {
      calls.push("provider");
      return {
        response: {
          kind: "evidence_tool_decision",
          summary: "Looking at the control.",
          decision: { kind: "tool_call", callId: "call.1", toolId: "test.inspect", input: {} }
        }
      };
    }
  };
}

function binding(calls: string[], resultCode?: string): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "test.domain",
    deniedEvidenceKeys: [],
    tools: [],
    classifyRefusal: (code) => (code === "test.refused.unsafe" ? "destructive_action_refused" : undefined),
    harnessOptions: {
      schemaVersion: "0.1",
      domainId: "test.domain",
      options: [{
        toolId: "test.inspect",
        description: "Look at what is actually there.",
        inputSchema: { type: "object", additionalProperties: false, properties: {} },
        effect: "observe",
        availability: { kind: "domain", domainId: "test.domain" },
        safety: { sideEffect: "observe" },
        stages: ["gather", "iterate"]
      }],
      implementations: {
        "test.inspect": async () => {
          calls.push("test.inspect");
          return { kind: "llm_evidence_tool_execution", evidence: { control: "absent" }, effectApplied: false, ...(resultCode ? { resultCode } : {}) };
        }
      }
    },
    executeTool: async () => { throw new Error("The bare tool slot is not used by this binding."); }
  };
}

function adaptationPolicy(): AutomationStudioAdaptationPolicy {
  return {
    schemaVersion: "0.1",
    policyId: "policy.exploration",
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
    requireApprovalForExternalSideEffects: false,
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
      actionAttemptCount: 0,
      interventionCount: 0,
      adaptationCount: 0
    },
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
