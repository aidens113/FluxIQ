import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../model/index.ts";
import {
  AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS,
  packAutomationStudioLlmContext,
  resolveAutomationStudioLlmInstructions,
  runAutomationStudioLlmHarness,
  validateAutomationStudioLlmOutput,
  type AutomationStudioLlmProvider
} from "./llm-harness.ts";

describe("Automation Studio LLM harness", () => {
  it("resolves scoped instructions by precedence and preserves IDs", () => {
    const resolution = resolveAutomationStudioLlmInstructions({
      instructions: [
        instruction({ instructionId: "global", scope: { kind: "global" }, priority: 1 }),
        instruction({ instructionId: "flow", scope: { kind: "flow", projectId: "project.llm", flowId: "flow.checkout" }, priority: 1 }),
        instruction({ instructionId: "node", scope: { kind: "node", projectId: "project.llm", flowId: "flow.checkout", nodeId: "submit" }, priority: 1 }),
        instruction({ instructionId: "other-node", scope: { kind: "node", projectId: "project.llm", flowId: "flow.checkout", nodeId: "other" }, priority: 10 })
      ],
      projectId: "project.llm",
      flowId: "flow.checkout",
      nodeId: "submit"
    });

    expect(resolution.instructionIds).toEqual(["global", "flow", "node"]);
    expect(resolution.diagnostics).toEqual([]);
  });

  it("detects conflicting required instructions and truncates to budget", () => {
    const resolution = resolveAutomationStudioLlmInstructions({
      instructions: [
        instruction({ instructionId: "always", body: "Always use the recovery route.", requirement: "required", scope: { kind: "flow", projectId: "project.llm", flowId: "flow.checkout" } }),
        instruction({ instructionId: "never", body: "Never use the recovery route.".repeat(80), requirement: "required", scope: { kind: "flow", projectId: "project.llm", flowId: "flow.checkout" } })
      ],
      projectId: "project.llm",
      flowId: "flow.checkout",
      tokenBudget: 128
    });

    expect(resolution.diagnostics.some((diagnostic) => diagnostic.code === "instruction.conflict")).toBe(true);
    expect(resolution.diagnostics.some((diagnostic) => diagnostic.code === "instruction.truncated")).toBe(true);
    expect(resolution.instructions.some((item) => item.truncated)).toBe(true);
  });

  it("packs compact context with prompt version, recent actions, subflows, and policy gates", () => {
    const context = packAutomationStudioLlmContext({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.failed",
      instructions: [],
      runDetail: {
        schemaVersion: "0.1",
        summary: {
          schemaVersion: "0.1",
          runId: "run.failed",
          flowId: "flow.checkout",
          projectId: "project.llm",
          status: "failed",
          updatedAt: 1,
          routeDecisionCount: 0,
          subflowEntryCount: 0,
          actionAttemptCount: 1,
          interventionCount: 0,
          adaptationCount: 0
        },
        actionAttempts: [{ attemptId: "submit.1", nodeId: "submit", definitionId: "builtin.policy.action", order: 1, status: "failed", startedAt: 1, comparisonStatus: "action_failed" }],
        routeDecisions: [],
        subflows: [],
        recoveryAttempts: [],
        interventions: [],
        adaptationIds: [],
        changeProposalIds: []
      },
      subflows: [{
        schemaVersion: "0.1",
        subflowId: "subflow.checkout",
        flowId: "flow.checkout",
        projectId: "project.llm",
        name: "Checkout",
        role: "primary",
        status: "active",
        routeTags: ["checkout"],
        createdAt: 1,
        updatedAt: 1
      }],
      policy: {
        schemaVersion: "0.1",
        policyId: "policy.checkout",
        scope: { kind: "flow", flowId: "flow.checkout" },
        preset: "repair",
        proposalMode: "auto",
        allowRuntimeRecovery: true,
        allowCreateRecoveryPaths: true,
        allowModifySubflows: false,
        allowCreateSubflows: false,
        allowModifyRouter: false,
        allowModifyExpectations: true,
        allowModifyActionTargets: true,
        allowDeleteOrDisableBehavior: false,
        allowExternalSideEffects: false,
        requireApprovalForDestructiveChanges: true,
        requireApprovalForExternalSideEffects: true,
        createdAt: 1,
        updatedAt: 1
      }
    });

    expect(context.promptVersion).toBe(AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS.runtime_diagnosis);
    expect(context.recentActions?.[0]).toMatchObject({ attemptId: "submit.1", comparisonStatus: "action_failed" });
    expect(context.subflows?.[0]).toMatchObject({ subflowId: "subflow.checkout", routeTags: ["checkout"] });
    expect(context.policyGates).toMatchObject({ allowRuntimeRecovery: true, allowExternalSideEffects: false });
  });

  it("validates structured responses and rejects executable code", () => {
    expect(validateAutomationStudioLlmOutput({
      kind: "runtime_patch",
      summary: "Retry with a longer wait.",
      riskLevel: "low",
      patches: [{ kind: "temporary_wait_retry", targetNodeId: "submit", timeoutMs: 5000, retryCount: 1, reason: "Confirmation arrived slowly." }]
    }, "runtime_patch")).toEqual([]);

    const diagnostics = validateAutomationStudioLlmOutput({
      kind: "change_proposal",
      summary: "Patch with code.",
      riskLevel: "high",
      patches: [{ kind: "edit_router", targetId: "router.checkout", summary: "Change route", after: { code: "eval('nope')" } }]
    }, "change_proposal");

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.executable_code");
  });

  it("records dry-run interventions without invoking a provider", async () => {
    const result = await runAutomationStudioLlmHarness({
      taskKind: "diagnosis_only_report",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.failed",
      instructions: [],
      dryRun: true,
      now: () => 42
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: "llm.dry_run" })]);
    expect(result.intervention).toMatchObject({
      interventionId: "intervention.diagnosis_only_report.run.failed.42",
      promptVersion: AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS.diagnosis_only_report,
      validation: { ok: true }
    });
  });

  it("runs a provider, validates output, and records provider metadata and usage", async () => {
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async () => ({
        response: { kind: "diagnosis", summary: "The confirmation signal is missing.", confidence: 0.8 },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.01 }
      })
    };

    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.failed",
      instructions: [],
      provider,
      now: () => 99
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toEqual({ provider: "mock", model: "debug-model" });
    expect(result.intervention).toMatchObject({
      provider: "mock",
      model: "debug-model",
      tokenUsage: { totalTokens: 15 },
      structuredResult: { kind: "diagnosis" }
    });
  });
});

function instruction(input: Partial<AutomationStudioFlowInstruction> & { instructionId: string; scope: AutomationStudioFlowInstruction["scope"] }): AutomationStudioFlowInstruction {
  return {
    schemaVersion: "0.1",
    title: input.instructionId,
    body: input.body ?? `Instruction ${input.instructionId}.`,
    priority: input.priority ?? 0,
    status: "active",
    requirement: input.requirement ?? "advisory",
    createdAt: 1,
    updatedAt: 1,
    ...input
  };
}
