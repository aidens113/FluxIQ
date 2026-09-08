import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowInstruction } from "../model/index.ts";
import { AutomationStudioLlmProviderError } from "./llm-provider-contract.ts";
import {
  AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  packAutomationStudioLlmContext,
  resolveAutomationStudioLlmInstructions,
  resolveAutomationStudioLlmTokenLimits,
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
        response: { kind: "diagnosis", summary: "The confirmation signal is missing.", confidence: 0.8, metadata: { untrusted: "discard me" } },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.01 },
        diagnostics: [{ severity: "warning", code: "provider.notice", message: "untrusted provider detail" }]
      })
    };

    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.failed",
      instructions: [],
      provider,
      requestId: "request.test.99",
      idempotencyKey: "request.test.idempotent",
      timeoutMs: 1234,
      now: () => 99
    });

    expect(result.ok).toBe(true);
    expect(result.provider).toEqual({ provider: "mock", model: "debug-model" });
    expect(result.request.tokenLimits).toEqual({ maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 });
    expect(result.response).not.toHaveProperty("metadata");
    expect(result.diagnostics).toEqual(expect.arrayContaining([{ severity: "warning", code: "llm.provider_diagnostic", message: "Provider reported a warning diagnostic." }]));
    expect(result.intervention).toMatchObject({
      provider: "mock",
      model: "debug-model",
      tokenUsage: { totalTokens: 15 },
      structuredResult: { kind: "diagnosis" },
      metadata: {
        requestId: "request.test.99",
        idempotencyKey: "request.test.idempotent",
        timeoutMs: 1234,
        tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }
      }
    });
    expect(result.intervention.structuredResult).not.toHaveProperty("summary");
  });

  it("enforces the absolute request ceiling before invoking a provider", async () => {
    let calls = 0;
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      runTask: async () => {
        calls += 1;
        return { response: { kind: "diagnosis", summary: "Should not run." } };
      }
    };
    const limits = resolveAutomationStudioLlmTokenLimits({ maxTotalTokens: AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST + 1 });
    expect(limits.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.absolute_token_ceiling");

    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      instructions: [],
      provider,
      tokenLimits: { maxInputTokens: 1000, maxOutputTokens: 1000, maxTotalTokens: AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST + 1 }
    });

    expect(calls).toBe(0);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.absolute_token_ceiling");
  });

  it("normalizes provider throws and malformed responses into failed interventions", async () => {
    const thrown = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.throw",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "throw" }, runTask: async () => { throw new Error("sensitive transport detail"); } },
      now: () => 100
    });
    expect(thrown.ok).toBe(false);
    expect(thrown.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "llm.provider_request_failed", message: expect.not.stringContaining("sensitive") })]));
    expect(thrown.intervention).toMatchObject({ validation: { ok: false } });

    const typedFailure = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.rate-limit",
      instructions: [],
      provider: {
        metadata: { provider: "mock", model: "rate-limit" },
        runTask: async () => { throw new AutomationStudioLlmProviderError("llm.provider_rate_limited", "secret-bearing provider detail", true, 429); }
      }
    });
    expect(typedFailure.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "llm.provider_rate_limited", message: "The LLM provider rate limited the request.", metadata: { retryable: true, providerStatus: 429 } })
    ]));

    const malformed = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.malformed",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "malformed" }, runTask: async () => ({ response: { kind: "diagnosis", summary: 42, unexpected: true } }) },
      now: () => 101
    });
    expect(malformed.ok).toBe(false);
    expect(malformed.response).toBeUndefined();
    expect(malformed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["llm_output.invalid_summary", "llm_output.unexpected_field"]));
    expect(malformed.intervention).toMatchObject({ validation: { ok: false } });
  });

  it("short-circuits million-entry and proxy provider-result bombs", async () => {
    const million = new Array(1_000_000);
    const bomb = await runAutomationStudioLlmHarness({ taskKind: "runtime_patch", projectId: "project.llm", flowId: "flow.checkout", instructions: [], provider: { metadata: { provider: "mock", model: "bomb" }, runTask: async () => ({ response: { kind: "runtime_patch", summary: "x", riskLevel: "low", patches: million } }) } });
    expect(bomb.ok).toBe(false);
    expect(bomb.diagnostics).toHaveLength(1);
    expect(bomb.diagnostics[0]?.code).toBe("llm_output.provider_result_too_large");
    const proxy = new Proxy({}, { ownKeys: () => { throw new Error("enumeration detail"); } });
    const trapped = await runAutomationStudioLlmHarness({ taskKind: "runtime_diagnosis", projectId: "project.llm", flowId: "flow.checkout", instructions: [], provider: { metadata: { provider: "mock", model: "proxy" }, runTask: async () => proxy } });
    expect(trapped.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "llm_output.invalid_provider_result", message: expect.not.stringContaining("enumeration") })]));
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
