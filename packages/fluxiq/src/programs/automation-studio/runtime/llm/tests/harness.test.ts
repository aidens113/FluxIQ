import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";
import {
  AUTOMATION_STUDIO_LLM_PROMPT_VERSIONS,
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST,
  packAutomationStudioLlmContext,
  resolveAutomationStudioLlmInstructions,
  resolveAutomationStudioLlmTokenLimits,
  runAutomationStudioLlmHarness,
  validateAutomationStudioLlmOutput,
  type AutomationStudioLlmProvider
} from "../harness.ts";

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
      // This fixture's domain denies nothing, and says so. An absent field is
      // refused outright once the packet carries evidence.
      deniedEvidenceKeys: [],
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
        actionAttempts: [{ attemptId: "submit.1", nodeId: "submit", definitionId: "builtin.policy.action", order: 1, status: "failed", route: "failed", startedAt: 1, durationMs: 12, comparisonStatus: "action_failed", message: "PRIVATE_PAGE_MESSAGE", metadata: { snapshot: { html: "PRIVATE_RAW_HTML" }, stateRefs: { private: true } } }],
        routeDecisions: [],
        subflows: [],
        recoveryAttempts: [],
        interventions: [],
        adaptationIds: [],
        changeProposalIds: []
      },
      failureEvidence: { schemaVersion: "web-llm-evidence.v2", trust: "untrusted-page-evidence", location: "https://example.test/form", elements: [{ target: "target.1", tag: "button", name: "Submit" }], truncated: false },
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
    expect(context.recentActions?.[0]).toEqual({ attemptId: "submit.1", nodeId: "submit", definitionId: "builtin.policy.action", order: 1, status: "failed", route: "failed", durationMs: 12, comparisonStatus: "action_failed" });
    expect(context.failureEvidence).toMatchObject({ schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1", tag: "button" }] });
    expect(JSON.stringify(context)).not.toMatch(/PRIVATE_PAGE_MESSAGE|PRIVATE_RAW_HTML|stateRefs/);
    expect(context.subflows?.[0]).toMatchObject({ subflowId: "subflow.checkout", routeTags: ["checkout"] });
    expect(context.policyGates).toMatchObject({ allowRuntimeRecovery: true, allowExternalSideEffects: false });
  });

  it("adds only the category of a valid failure record to recent actions", () => {
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
          actionAttemptCount: 2,
          interventionCount: 0,
          adaptationCount: 0
        },
        actionAttempts: [
          {
            attemptId: "submit.1", nodeId: "submit", definitionId: "builtin.policy.action", order: 1, status: "failed", startedAt: 1,
            failure: { category: "target_not_found", code: "web.target.selector_miss", retryable: true, expected: "PRIVATE_EXPECTED", actual: "PRIVATE_ACTUAL" }
          },
          {
            attemptId: "submit.2", nodeId: "submit", definitionId: "builtin.policy.action", order: 2, status: "failed", startedAt: 2,
            failure: { category: "timeout", code: "x", retryable: "yes" } as never
          }
        ],
        routeDecisions: [],
        subflows: [],
        recoveryAttempts: [],
        interventions: [],
        adaptationIds: [],
        changeProposalIds: []
      }
    });

    expect(context.recentActions?.[0]).toEqual({ attemptId: "submit.1", nodeId: "submit", definitionId: "builtin.policy.action", order: 1, status: "failed", failureCategory: "target_not_found" });
    expect(context.recentActions?.[1]).not.toHaveProperty("failureCategory");
    expect(JSON.stringify(context)).not.toMatch(/PRIVATE_EXPECTED|PRIVATE_ACTUAL|selector_miss/);
  });

  it("carries failure evidence whole and exposes it only to runtime diagnosis or patch tasks", () => {
    const base = { projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[], deniedEvidenceKeys: [] as readonly string[] };
    // Nothing capped (2026-09-30): a 200 KB page, a 5,000-character string,
    // 2,000 elements and nesting past the old depth of 12 all reach the model.
    const whole: JsonObject = {
      schemaVersion: "web-llm-evidence.v1",
      note: "x".repeat(5_000),
      elements: Array.from({ length: 2_000 }, (_, index) => ({ tag: "li", text: `Row ${index} ${"y".repeat(80)}` })),
      deep: Array.from({ length: 20 }).reduce<JsonObject>((inner) => ({ inner }), { leaf: true })
    };
    expect(Buffer.byteLength(JSON.stringify(whole), "utf8")).toBeGreaterThan(200_000);
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "runtime_diagnosis", failureEvidence: whole }).failureEvidence).toEqual(whole);
    // `snapshot` used to be one of seven keys Core denied by name. Denying it
    // was wrong twice over: the other six are a browser's and an HTTP client's
    // vocabulary inside a framework that has neither, and `snapshot` is Core's
    // own word -- Core's own state-snapshot harness option produces one. Core
    // now carries it.
    expect(packAutomationStudioLlmContext({
      ...base,
      taskKind: "runtime_patch",
      failureEvidence: { schemaVersion: "web-llm-evidence.v1", snapshot: { location: "private" } }
    }).failureEvidence).toEqual({ schemaVersion: "web-llm-evidence.v1", snapshot: { location: "private" } });
    // The protection is kept without the nouns: the domain that knows what raw
    // payload looks like for its medium declares the keys, and Core enforces
    // the declaration at any depth, normalizing case and separators so
    // `innerHTML` and `inner_html` are the same claim.
    expect(() => packAutomationStudioLlmContext({
      ...base,
      taskKind: "runtime_patch",
      deniedEvidenceKeys: ["innerHTML", "pageSource"],
      failureEvidence: { schemaVersion: "web-llm-evidence.v1", elements: [{ inner_html: "PRIVATE_RAW_HTML" }] }
    })).toThrow(/denied key/);
    expect(() => packAutomationStudioLlmContext({
      ...base,
      taskKind: "flow_bootstrap",
      failureEvidence: { schemaVersion: "web-llm-evidence.v1" }
    })).toThrow(/only to runtime diagnosis and patch/);
  });

  it("accepts bounded advisory reusable context and rejects executable cached targets", () => {
    const base = { taskKind: "runtime_diagnosis" as const, projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[], deniedEvidenceKeys: [] as readonly string[] };
    const reusableContext = { schemaVersion: "automation-studio.reusable-llm-context-packet.v1" as const, items: [{ advisory: true as const, recordId: "context.one", contentDigest: "a".repeat(64), outcome: "succeeded" as const, reviewerState: "approved" as const, validationState: "validated" as const, sourceRunIds: ["run.one"], sourceAdaptationIds: [], promptProjection: { facts: [{ kind: "element", role: "button" }] } }] };
    expect(packAutomationStudioLlmContext({ ...base, reusableContext }).reusableContext).toEqual(reusableContext);
    // Core denies its own vocabulary: the `target` family is what a repair
    // addresses in every domain, so historical context may never carry one.
    expect(() => packAutomationStudioLlmContext({ ...base, reusableContext: { ...reusableContext, items: [{ ...reusableContext.items[0]!, promptProjection: { targetNodeId: "node.submit" } }] } })).toThrow("packet is invalid");
    // `selector` is a browser's word for a target and is no longer Core's to
    // deny. The domain declares it, and the same declaration that bounds
    // failure evidence bounds reusable context, so the two cannot drift.
    expect(() => packAutomationStudioLlmContext({ ...base, deniedEvidenceKeys: ["selector"], reusableContext: { ...reusableContext, items: [{ ...reusableContext.items[0]!, promptProjection: { selector: "#cached-target" } }] } })).toThrow("packet is invalid");
  });

  it("refuses a packet carrying evidence that arrives with no declaration at all", () => {
    const base = { taskKind: "runtime_diagnosis" as const, projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[] };
    const failureEvidence = { schemaVersion: "web-llm-evidence.v1", elements: [{ tag: "button", name: "Submit" }], truncated: false };
    const reusableContext = { schemaVersion: "automation-studio.reusable-llm-context-packet.v1" as const, items: [{ advisory: true as const, recordId: "context.one", contentDigest: "a".repeat(64), outcome: "succeeded" as const, reviewerState: "approved" as const, validationState: "validated" as const, sourceRunIds: ["run.one"], sourceAdaptationIds: [], promptProjection: { facts: [{ kind: "element", role: "button" }] } }] };
    // An absent declaration used to mean "deny nothing", so a domain that
    // simply forgot the field had its raw payload bounded for shape and size
    // and for nothing else, and nothing anywhere said so. Absent now means
    // nobody said, and a packet built from nobody-said is refused. The two
    // places a domain's raw payload can reach the model are both covered.
    expect(() => packAutomationStudioLlmContext({ ...base, failureEvidence })).toThrow(/declared deniedEvidenceKeys/);
    expect(() => packAutomationStudioLlmContext({ ...base, reusableContext })).toThrow(/declared deniedEvidenceKeys/);
    // `[]` is a domain stating it has nothing of the sort: a claim a reviewer
    // can see and argue with, where an absent field is not. It passes.
    expect(packAutomationStudioLlmContext({ ...base, deniedEvidenceKeys: [], failureEvidence }).failureEvidence).toEqual(failureEvidence);
    expect(packAutomationStudioLlmContext({ ...base, deniedEvidenceKeys: [], reusableContext }).reusableContext).toEqual(reusableContext);
    // A packet that carries neither has nothing of the domain's in it, so it
    // needs no declaration and is left alone.
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "flow_bootstrap" }).failureEvidence).toBeUndefined();
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

  it("accepts task-specific diagnosis and target-override JSON and rejects the wrong kind", async () => {
    const diagnosis = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "schema" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "The action target no longer resolves.", confidence: 0.95 } }) }
    });
    expect(diagnosis.ok).toBe(true);
    expect(diagnosis.response?.kind).toBe("diagnosis");

    const patch = await runAutomationStudioLlmHarness({
      taskKind: "runtime_patch",
      expectedOutput: "runtime_patch",
      projectId: "project.llm",
      flowId: "flow.checkout",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "schema" }, runTask: async () => ({ response: { kind: "runtime_patch", summary: "Use the current target.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "submit", target: { handles: { element: "target.1" } }, reason: "The target moved." }] } }) }
    });
    expect(patch.ok).toBe(true);
    expect(patch.response).toMatchObject({ kind: "runtime_patch", patches: [{ kind: "temporary_target_override" }] });

    const wrongKind = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "schema" }, runTask: async () => ({ response: { kind: "runtime_patch", summary: "Wrong kind.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "submit", reason: "Wrong output." }] } }) }
    });
    expect(wrongKind.ok).toBe(false);
    expect(wrongKind.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "llm_output.kind_mismatch" })]));
  });

  it.each([
    {},
    { handles: {} },
    { handles: { element: "" } },
    { handles: { element: "   " } },
    // A domain resolution is not something a model may author, so a target that
    // carries one alongside its handles is refused whatever the extra key is.
    { handles: { element: "target.1" }, selector: "#private-target" },
    { handles: { element: "target.1" }, unknown: true },
    // Nor may a handle be a locator: the handle vocabulary has no room for
    // whitespace, brackets, quotes, combinators, or a leading punctuation mark.
    { handles: { element: "#private-target" } },
    { handles: { element: "input[name=\"q\"]" } },
    { handles: { element: "div > .item" } },
    { handles: { element: ".row:nth-child(1)" } },
    { handles: { element: "//button[@id='go']" } },
    { handles: { element: "target.1 target.2" } },
    { handles: { "element name": "target.1" } },
    { type: "css", value: "#private-target" },
    { locator: { role: "button", name: "Submit" } }
  ])("rejects a target override that is not a bare handle map, without reflecting its content (%j)", async (target) => {
    const result = await runAutomationStudioLlmHarness({
      taskKind: "runtime_patch",
      expectedOutput: "runtime_patch",
      projectId: "project.llm",
      flowId: "flow.checkout",
      instructions: [],
      provider: { metadata: { provider: "mock", model: "schema" }, runTask: async () => ({ response: { kind: "runtime_patch", summary: "Use the current target.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "submit", target, reason: "The target changed." }] } }) }
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "llm_output.invalid_target_override" })]));
    expect(JSON.stringify(result.diagnostics)).not.toContain("#private-target");
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
      },
      // A rate limit is now asked again with backoff
      // (`../provider-retry/call.ts`). What this test is about is the diagnostic
      // the harness writes, so the waiting is made free; the policy's own
      // arithmetic is proved in `provider-retry/tests/`.
      providerRetry: { wait: async () => {} }
    });
    expect(typedFailure.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "llm.provider_rate_limited", message: "The LLM provider rate limited the request.", metadata: { retryable: true, providerStatus: 429 } })
    ]));

    const crossBundleFailure = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.cross-bundle",
      instructions: [],
      provider: {
        metadata: { provider: "mock", model: "cross-bundle" },
        runTask: async () => { throw { name: "AutomationStudioLlmProviderError", code: "llm.provider_http_error", retryable: true, status: 503, message: "private upstream body" }; }
      },
      providerRetry: { wait: async () => {} }
    });
    expect(crossBundleFailure.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "llm.provider_http_error", message: "The LLM provider returned an unsuccessful HTTP status.", metadata: { retryable: true, providerStatus: 503 } })
    ]));
    expect(JSON.stringify(crossBundleFailure)).not.toContain("private upstream body");

    const cloneStrippedFailure = await runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.clone-stripped",
      instructions: [],
      provider: {
        metadata: { provider: "mock", model: "clone-stripped" },
        runTask: async () => { throw { code: "llm.provider_auth_failed", retryable: false, status: 401, message: "private cloned credential detail", provenance: { providerInvocation: "not_attempted", providerResponse: "not_received" } }; }
      }
    });
    expect(cloneStrippedFailure.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "llm.provider_auth_failed", message: "The LLM provider rejected the configured credential.", metadata: { retryable: false, providerStatus: 401 } })
    ]));
    expect(JSON.stringify(cloneStrippedFailure)).not.toMatch(/private cloned|not_attempted/);

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

// D-3. The pages a recovery's exploration returned reach the patch that
// follows, so a control only the exploration revealed can be named in the
// repair -- every one of them, whole (2026-09-30, "the model sees the whole
// page"), with only denied keys and credential shapes withheld.
describe("Automation Studio LLM harness, explored evidence", () => {
  const base = { projectId: "project.llm", flowId: "flow.checkout", instructions: [] as AutomationStudioFlowInstruction[], deniedEvidenceKeys: [] as readonly string[] };
  const page = (label: string, extra: JsonObject = {}): JsonObject => ({ schemaVersion: "web-llm-evidence.v2", location: `https://example.test/${label}`, elements: [{ target: "target.1", tag: "button", name: label }], ...extra });
  const withheld = (reason: string): JsonObject => ({ schemaVersion: "automation-studio.explored-packet-withheld.v1", withheld: reason });

  it("carries every explored packet to a runtime patch, in order, with a denied or secret packet withheld in its place", () => {
    const context = packAutomationStudioLlmContext({
      ...base,
      taskKind: "runtime_patch",
      deniedEvidenceKeys: ["innerHTML"],
      explorationEvidence: {
        packets: [
          { evidenceId: "explored.1", toolId: "web.recovery.inspect", packet: page("first") },
          // Raw payload under a declared key, at any depth: never sent.
          { evidenceId: "explored.2", toolId: "web.recovery.inspect", packet: page("raw", { elements: [{ target: "target.1", inner_html: "PRIVATE_RAW_HTML" }] }) },
          // A domain's refusal is evidence too, and is carried.
          { evidenceId: "explored.3", toolId: "web.recovery.act", packet: { ok: false, code: "target_unsafe" } },
          { evidenceId: "explored.4", toolId: "web.recovery.reveal", packet: page("revealed") },
          { evidenceId: "explored.5", toolId: "web.recovery.inspect", packet: page("token", { note: "Bearer abcdefghij0123456789klmnop" }) }
        ]
      }
    });

    expect(context.explorationEvidence).toEqual({
      schemaVersion: "automation-studio.exploration-evidence.v1",
      packets: [
        { evidenceId: "explored.1", toolId: "web.recovery.inspect", packet: page("first") },
        { evidenceId: "explored.2", toolId: "web.recovery.inspect", packet: withheld("denied_key") },
        { evidenceId: "explored.3", toolId: "web.recovery.act", packet: { ok: false, code: "target_unsafe" } },
        { evidenceId: "explored.4", toolId: "web.recovery.reveal", packet: page("revealed") },
        { evidenceId: "explored.5", toolId: "web.recovery.inspect", packet: withheld("secret_shaped") }
      ]
    });
    expect(JSON.stringify(context)).not.toContain("PRIVATE_RAW_HTML");
    expect(JSON.stringify(context)).not.toContain("abcdefghij0123456789");
  });

  it("carries every packet however many and however large, with no allowance and no count", () => {
    const large = page("large", { text: "z".repeat(50_000), elements: Array.from({ length: 1_500 }, (_, index) => ({ tag: "li", name: `Item ${index}` })) });
    const many = packAutomationStudioLlmContext({
      ...base,
      taskKind: "runtime_patch",
      explorationEvidence: { packets: [
        ...Array.from({ length: 70 }, (_, index) => ({ evidenceId: `explored.${index + 1}`, toolId: "web.recovery.inspect", packet: { schemaVersion: "web-llm-evidence.v2" } })),
        { evidenceId: "explored.71", toolId: "web.recovery.inspect", packet: large }
      ] }
    });
    expect(many.explorationEvidence?.packets).toHaveLength(71);
    expect(many.explorationEvidence?.packets[0]?.evidenceId).toBe("explored.1");
    expect(many.explorationEvidence?.packets[70]?.packet).toEqual(large);
    expect(many.explorationEvidence).not.toHaveProperty("withheldPackets");
  });

  it("refuses explored evidence on any other task, without a declaration, or with labels that could be misread", () => {
    const explorationEvidence = { packets: [{ evidenceId: "explored.1", toolId: "web.recovery.inspect", packet: page("first") }] };
    for (const taskKind of ["evidence_tool_decision", "flow_bootstrap"] as const) {
      expect(() => packAutomationStudioLlmContext({ ...base, taskKind, explorationEvidence }), taskKind).toThrow(/only to runtime patch and runtime diagnosis/);
    }
    // A runtime diagnosis carries them when it is the loop re-planning after a
    // look: a second call shown none of what the look found is the first call
    // asked again, at the same price, for the same answer.
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "runtime_diagnosis", stage: "plan", explorationEvidence }).explorationEvidence?.packets).toHaveLength(1);
    const undeclared = { projectId: base.projectId, flowId: base.flowId, instructions: base.instructions };
    expect(() => packAutomationStudioLlmContext({ ...undeclared, taskKind: "runtime_patch", explorationEvidence })).toThrow(/declared deniedEvidenceKeys/);
    for (const evidenceId of ["explored:1", "", "explored.1"]) {
      const packets = [...explorationEvidence.packets, { evidenceId, toolId: "web.recovery.inspect", packet: page("second") }];
      expect(() => packAutomationStudioLlmContext({ ...base, taskKind: "runtime_patch", explorationEvidence: { packets } }), evidenceId).toThrow(/distinct bounded labels/);
    }
    // No packets offered, no slot: the request is the one it always was.
    expect(packAutomationStudioLlmContext({ ...base, taskKind: "runtime_patch" })).not.toHaveProperty("explorationEvidence");
  });

  it("tells the model how to name a handle from an explored packet only when the request carries one", async () => {
    const withPackets = await promptFor({ packets: [{ evidenceId: "explored.1", toolId: "web.recovery.reveal", packet: page("revealed") }] });
    const withoutSlot = await promptFor(undefined);

    expect(withPackets.system).toContain("explorationEvidence.packets");
    expect(withPackets.system).toContain("explored.2:target.3");
    expect(withPackets.context.explorationEvidence).toMatchObject({ packets: [{ evidenceId: "explored.1" }] });
    expect(withoutSlot.system).not.toContain("explorationEvidence");
    expect(withoutSlot.context).not.toHaveProperty("explorationEvidence");
  });

  async function promptFor(explorationEvidence: { packets: Array<{ evidenceId: string; toolId: string; packet: JsonObject }> } | undefined): Promise<{ system: string; context: Record<string, unknown> }> {
    const prepared = await runAutomationStudioLlmHarness({
      ...base,
      taskKind: "runtime_patch",
      dryRun: true,
      ...(explorationEvidence ? { explorationEvidence } : {})
    });
    let outboundBody = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (request) => {
        outboundBody = request.outboundBody;
        return "test-secret";
      },
      // Never sent: the body is read when the secret is resolved.
      fetchImpl: (async () => { throw new Error("transport must not run"); }) as typeof fetch
    });
    await expect(provider.runTask(prepared.request)).rejects.toBeInstanceOf(AutomationStudioLlmProviderError);
    const messages = (JSON.parse(outboundBody) as { messages: Array<{ role: string; content: string }> }).messages;
    return {
      system: messages.find((message) => message.role === "system")!.content,
      context: (JSON.parse(messages.find((message) => message.role === "user")!.content) as { context: Record<string, unknown> }).context
    };
  }
});

/** One explored packet carrying `padding` bytes of text, in strings no longer than a packet may hold. */
function filled(padding: number) {
  const strings = Array.from({ length: Math.ceil(padding / 2_000) }, (_, index) => "x".repeat(Math.min(2_000, padding - index * 2_000)));
  return { evidenceId: "explored.1", toolId: "web.recovery.inspect", packet: { schemaVersion: "web-llm-evidence.v2", padding: strings } as JsonObject };
}

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
