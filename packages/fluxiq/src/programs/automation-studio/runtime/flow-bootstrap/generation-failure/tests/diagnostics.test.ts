import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES } from "../../../llm/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../../loop-limits/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS } from "../../decision-step-ids.ts";
import { automationStudioFlowBootstrapLargestSizeLimits } from "../../plan/index.ts";
import {
  flowBootstrapEvidenceLoopFailure,
  flowBootstrapEvidenceUnusableDecisionFailure,
  flowBootstrapHarnessFailure,
  flowBootstrapPhaseFailure,
  parseAutomationStudioFlowBootstrapFailureDiagnostic,
  parseAutomationStudioFlowBootstrapGenerationError
} from "../index.ts";

describe("Flow Bootstrap generation failure diagnostics", () => {
  // `retryable` is per code, not per stage. Every ending here is one a retry
  // could not get past -- a loop that repeated itself or ran its evidence out
  // will do it again -- except the one that ran out of turns, which has its own
  // block below and is the whole point of the distinction.
  it.each([
    ["llm_evidence_loop.invalid_decision", "flow_bootstrap.evidence_invalid_decision"],
    ["llm_evidence_loop.unknown_tool", "flow_bootstrap.evidence_unknown_tool"],
    ["llm_evidence_loop.duplicate_call", "flow_bootstrap.evidence_duplicate_call"],
    ["llm_evidence_loop.duplicate_tool_request", "flow_bootstrap.evidence_duplicate_tool_request"],
    ["llm_evidence_loop.repeat_without_progress", "flow_bootstrap.evidence_repeat_without_progress"],
    ["llm_evidence_loop.tool_failed", "flow_bootstrap.evidence_tool_failed"],
    ["llm_evidence_loop.evidence_limit", "flow_bootstrap.evidence_limit"],
    ["llm_evidence_loop.cancelled", "flow_bootstrap.evidence_cancelled"]
  ] as const)("preserves closed evidence coordinator failure %s", (code, expectedCode) => {
    const failure = flowBootstrapEvidenceLoopFailure({
      ok: false,
      code,
      trace: [{ iteration: 1, decision: "tool_call", callId: "private.call", toolId: "web.click_safe", evidenceBytes: 123, effectApplied: false, resultCode: "action.recoverable" }],
      steps: [],
      accounting: { iterations: 2, toolCalls: 1, evidenceBytes: 123, inputTokens: 10, cacheHitInputTokens: 0, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
    });
    expect(failure.diagnostic).toEqual({
      code: expectedCode,
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: { iterationCount: 2, decisionCount: 1, toolCallCount: 1, evidenceBytes: 123, steps: [{ toolId: "web.click_safe", iteration: 1, effectApplied: false, resultCode: "action.recoverable", evidenceBytes: 123 }] }
    });
    expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
    expect(JSON.stringify(failure)).not.toContain("private.call");
  });

  /**
   * **A loop that ran out of turns is published as that, and as retryable.**
   *
   * The defect these rows hold shut: `run-mulryg6h-ff241a12` explored a site
   * competently for thirteen decisions, spent its remaining calls on one
   * extraction that kept failing, and used the twenty-sixth of its twenty-six.
   * It was published as `flow_bootstrap.evidence_unusable_decision` --
   * "the model kept answering with something the exploration could not use" --
   * at `retryable: false`, because the loop's last paid decision happened to be
   * a refused completion. Nothing was validated, the provider's output was never
   * the problem, and a larger budget was exactly what the run needed. A debug of
   * that build spent hours inside the completion checks before reaching the
   * loop's fall-through.
   *
   * Conflating the two again fails here: the code, the retryability and the
   * exhaustion record are each asserted, and the unusable-decision ending is
   * asserted alongside to prove the two are still told apart.
   */
  describe("an exploration that ran out of turns", () => {
    const exhausted = (bound: "iterations" | "budget" | "tool_calls", lastIssueCodes: readonly string[] = []) => flowBootstrapEvidenceLoopFailure({
      ok: false,
      code: "llm_evidence_loop.iteration_limit",
      trace: [{ iteration: 26, decision: "unusable", resultCode: "bootstrap.cannot_answer_instruction" }],
      steps: [],
      accounting: { iterations: 26, toolCalls: 22, evidenceBytes: 4_096, inputTokens: 400_000, cacheHitInputTokens: 0, outputTokens: 2_600, totalTokens: 402_600, estimatedCostUsd: 0.047 },
      exhaustion: { bound, maxIterations: 26, iterations: 26, draftSteps: 13, proposableSteps: 7, completionAttempts: 3, lastIssueCodes, outstandingIssueCodes: lastIssueCodes }
    });

    it("is named as itself and marked retryable, never as an unusable decision", () => {
      const failure = exhausted("iterations", ["bootstrap.cannot_answer_instruction"]);
      expect(failure.diagnostic.code).toBe("flow_bootstrap.evidence_iteration_limit");
      expect(failure.diagnostic.code).not.toBe("flow_bootstrap.evidence_unusable_decision");
      // The field an operator acts on. `false` here is what sent the debug of
      // `run-mulryg6h-ff241a12` looking for a model defect that was not there.
      expect(failure.diagnostic.retryable).toBe(true);
      // And the ending it was mistaken for is still not retryable, so the two
      // cannot be made to agree by flattening one of them.
      expect(flowBootstrapEvidenceUnusableDecisionFailure({
        trace: [{ iteration: 1, decision: "unusable" }],
        accounting: { iterations: 1, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
        issueCodes: ["bootstrap.cannot_answer_instruction"]
      }).diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_unusable_decision", retryable: false });
    });

    it("carries what it was allowed, what it used, and how close the draft came", () => {
      const failure = exhausted("iterations", ["bootstrap.cannot_answer_instruction"]);
      expect(failure.diagnostic.evidenceLoop).toMatchObject({
        iterationCount: 26,
        exhausted: { bound: "iterations", maxIterations: 26, iterations: 26, draftSteps: 13, proposableSteps: 7, completionAttempts: 3 }
      });
      // The last refusal is context for the ending, and travels where every
      // other issue code does rather than in a second place of its own.
      expect(failure.diagnostic.issueCodes).toEqual(["bootstrap.cannot_answer_instruction"]);
      expect(failure.diagnostic.evidenceLoop?.exhausted).not.toHaveProperty("lastIssueCodes");
    });

    it.each(["iterations", "budget", "tool_calls"] as const)("round-trips through the reader for the %s allowance", (bound) => {
      const failure = exhausted(bound);
      expect(parseAutomationStudioFlowBootstrapGenerationError(failure)).toEqual(failure.diagnostic);
    });

    // The producer and the reader share one table, so a record claiming the
    // ending without its retryability is not Core's and does not read back.
    it("refuses a stored record that claims the ending but not its retryability", () => {
      const stored = { ...JSON.parse(JSON.stringify(exhausted("iterations").diagnostic)), retryable: false };
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toBeNull();
    });

    // All-or-nothing, like every other member of this record. "It ran out of
    // turns and got this far" with unreadable numbers behind it is a worse
    // account than none, so it refuses the diagnostic rather than arriving short.
    it.each([
      ["an allowance it does not have", { bound: "tokens" }],
      ["more iterations than the loop may have", { maxIterations: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1 }],
      ["more proposable steps than steps", { draftSteps: 2, proposableSteps: 3 }],
      ["a fractional count", { completionAttempts: 1.5 }],
      ["a negative count", { draftSteps: -1 }],
      ["a field nothing declares", { lastIssueCodes: ["bootstrap.cannot_answer_instruction"] }]
    ])("refuses a stored exhaustion naming %s", (_name, override) => {
      const stored = JSON.parse(JSON.stringify(exhausted("iterations").diagnostic)) as { evidenceLoop: { exhausted: Record<string, unknown> } };
      stored.evidenceLoop.exhausted = { ...stored.evidenceLoop.exhausted, ...override };

      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toBeNull();
    });

    // A Flow is no longer capped at sixty-four nodes, so an exploration of a
    // Flow whose setting allows a hundred or more steps must still be read
    // back with its account intact. The reader has no Flow in hand and bounds
    // by the largest Flow the setting allows.
    it.each([100, 150])("reads back a stored exhaustion and kept-draft pointer of %i draft steps", (draftSteps) => {
      const stored = JSON.parse(JSON.stringify(exhausted("iterations").diagnostic)) as { evidenceLoop: { exhausted: Record<string, unknown>; incompleteDraft?: unknown } };
      stored.evidenceLoop.exhausted = { ...stored.evidenceLoop.exhausted, draftSteps, proposableSteps: draftSteps };
      stored.evidenceLoop.incompleteDraft = { revision: 1, steps: draftSteps };

      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)?.evidenceLoop).toMatchObject({
        exhausted: { draftSteps, proposableSteps: draftSteps },
        incompleteDraft: { revision: 1, steps: draftSteps }
      });
    });

    it("refuses a stored exhaustion claiming more draft steps than any Flow could hold", () => {
      const beyond = automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 2;
      const stored = JSON.parse(JSON.stringify(exhausted("iterations").diagnostic)) as { evidenceLoop: { exhausted: Record<string, unknown> } };
      stored.evidenceLoop.exhausted = { ...stored.evidenceLoop.exhausted, draftSteps: beyond, proposableSteps: 1 };

      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toBeNull();
    });
  });

  it("projects provider failures into a bounded, sanitized public diagnostic", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_http_error", message: "must not escape", metadata: { retryable: false, providerStatus: 400, privateBody: "must not escape" } }],
      request: {
        requestId: "request.one",
        idempotencyKey: "idempotency.one",
        taskKind: "flow_bootstrap",
        promptVersion: "automation-studio.flow-bootstrap.v1",
        expectedOutput: "flow_bootstrap",
        context: { schemaVersion: "0.1", taskKind: "flow_bootstrap", promptVersion: "automation-studio.flow-bootstrap.v1", projectId: "project.one", flowId: "flow.one", instructions: { instructionIds: [], instructions: [], diagnostics: [], tokenBudget: 384, estimatedTokens: 0 } },
        tokenLimits: { maxInputTokens: 2000, maxOutputTokens: 512, maxTotalTokens: 3000 },
        estimatedInputTokens: 1996,
        maxEstimatedCostUsd: 0.25,
        timeoutMs: 20_000
      },
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.one", estimatedInputTokens: 1996, provider: "deepseek", model: "deepseek-flash", providerStatus: 400 }
    });
    expect(JSON.stringify(failure.diagnostic)).not.toContain("must not escape");
  });

  it("parses exact public diagnostics and rejects extra, secret-shaped, or unbounded fields", () => {
    const valid = {
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.one", estimatedInputTokens: 1996, provider: "deepseek", model: "deepseek-flash", providerStatus: 400 }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, code: "flow_bootstrap.invalid_input", stage: "pre_provider_validation", providerInvocation: "not_attempted", providerResponse: "not_received", accounting: undefined })).toEqual({ code: "flow_bootstrap.invalid_input", stage: "pre_provider_validation", retryable: false, providerInvocation: "not_attempted", providerResponse: "not_received" });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, prompt: "private" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, authorization: "private" } })).toBeNull();
    // A build's totals add up every call it made, so they are bounded by every
    // call the loop may make at one request's ceiling -- not by that ceiling.
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, estimatedInputTokens: 50_001, totalTokens: 60_000 } })).toMatchObject({ accounting: { estimatedInputTokens: 50_001, totalTokens: 60_000 } });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, estimatedInputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS + 1 } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, accounting: { ...valid.accounting, totalTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS + 1 } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, stage: "raw_provider_body" })).toBeNull();
  });

  it("accepts only bounded categorical evidence steps", () => {
    const valid = {
      code: "flow_bootstrap.evidence_tool_failed",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: {
        iterationCount: 2,
        decisionCount: 2,
        toolCallCount: 1,
        evidenceBytes: 123,
        steps: [{ toolId: "web.click", effectApplied: false, resultCode: "target.not_found" }]
      }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      evidenceLoop: { ...valid.evidenceLoop, steps: [{ toolId: "web.click", resultCode: "private result text!" }] }
    })).toBeNull();
    // Bounded by the loop's own ceiling -- its decisions plus one opening
    // observation -- not by the sixteen it used to be. A diagnostic from a
    // longer exploration failed to parse at sixteen, and its named reason was
    // replaced by a generic transport failure. And by that ceiling for every
    // live round a build may run: a build that could not finish publishes all
    // of its rounds, not the last one's alone (t214).
    const rounds = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS;
    const longest = (AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1) * rounds;
    const long = {
      ...valid,
      evidenceLoop: { iterationCount: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * rounds, decisionCount: longest, toolCallCount: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls * rounds, evidenceBytes: 123, steps: Array.from({ length: longest }, () => ({ toolId: "web.click" })) }
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(long)).toEqual(long);
    // The steps are one per trace row, not one per decision, and the one kind
    // of decision that edits the draft and re-runs a step writes two rows under
    // its single iteration. So they are bounded by the rows: at the decision
    // ceiling this refused a record the loop can legitimately write, and threw
    // away the whole named reason for a build that had corrected itself.
    const mostRows = (AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2 + 1) * rounds;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...long,
      evidenceLoop: { ...long.evidenceLoop, steps: Array.from({ length: mostRows }, () => ({ toolId: "web.click" })) }
    })).not.toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      evidenceLoop: { ...valid.evidenceLoop, steps: Array.from({ length: mostRows + 1 }, () => ({ toolId: "web.click" })) }
    })).toBeNull();
    for (const field of ["iterationCount", "decisionCount", "toolCallCount"] as const) {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...long, evidenceLoop: { ...long.evidenceLoop, [field]: longest + 1 } })).toBeNull();
    }
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...long, evidenceLoop: { ...long.evidenceLoop, iterationCount: long.evidenceLoop.iterationCount + 1 } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...long, evidenceLoop: { ...long.evidenceLoop, toolCallCount: long.evidenceLoop.toolCallCount + 1 } })).toBeNull();
  });

  it("names an exploration stopped on unusable decisions, with its progress and why", () => {
    const error = flowBootstrapEvidenceUnusableDecisionFailure({
      trace: [
        { iteration: 0, decision: "tool_call", toolId: "web.inspect", evidenceBytes: 40 },
        { iteration: 1, decision: "unusable", resultCode: "bootstrap.invalid_parameter_value" },
        { iteration: 2, decision: "unusable", resultCode: "a refusal in prose, not a code" },
        { iteration: 3, decision: "unusable" }
      ],
      accounting: { iterations: 3, toolCalls: 1, evidenceBytes: 40, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      issueCodes: ["bootstrap.invalid_parameter_value", "bootstrap.invalid_parameter_value", "a refusal in prose, not a code"]
    }, { requestId: "evidence.1", estimatedInputTokens: 9_000, inputTokens: 7_000, totalTokens: 8_000 });
    expect(parseAutomationStudioFlowBootstrapGenerationError(error)).toEqual({
      code: "flow_bootstrap.evidence_unusable_decision",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "evidence.1", estimatedInputTokens: 9_000, inputTokens: 7_000, totalTokens: 8_000 },
      // Every decision, in order: the refused ones by Core's own step name and
      // the code that refused each, so the record says what each call came to.
      evidenceLoop: {
        iterationCount: 3,
        // Three decisions, not four rows: iteration 0 is the deterministic
        // opening observation and was never a provider call.
        decisionCount: 3,
        toolCallCount: 1,
        evidenceBytes: 40,
        steps: [
          { toolId: "web.inspect", iteration: 0, evidenceBytes: 40 },
          { toolId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS.unusable, iteration: 1, resultCode: "bootstrap.invalid_parameter_value" },
          { toolId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS.unusable, iteration: 2 },
          { toolId: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS.unusable, iteration: 3 }
        ]
      },
      issueCodes: ["bootstrap.invalid_parameter_value"]
    });
  });

  it("records a loop that never called a tool by its decisions alone, and an accepted completion by name", () => {
    const stalled = flowBootstrapEvidenceUnusableDecisionFailure({
      trace: [{ iteration: 1, decision: "unusable", resultCode: "llm.provider_malformed_response" }],
      accounting: { iterations: 1, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      issueCodes: ["llm.provider_malformed_response"]
    });
    expect(stalled.diagnostic.evidenceLoop?.steps).toEqual([{ toolId: "core.decision_unusable", iteration: 1, resultCode: "llm.provider_malformed_response" }]);
    const ended = flowBootstrapEvidenceLoopFailure({
      ok: false,
      code: "llm_evidence_loop.iteration_limit",
      trace: [{ iteration: 1, decision: "complete" }],
      steps: [],
      accounting: { iterations: 1, toolCalls: 0, evidenceBytes: 0, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }
    });
    expect(ended.diagnostic.evidenceLoop?.steps).toEqual([{ toolId: "core.decision_complete", iteration: 1 }]);
    // The names fit the step shape a reader already parses.
    expect(parseAutomationStudioFlowBootstrapGenerationError(stalled)).toEqual(stalled.diagnostic);
    expect(parseAutomationStudioFlowBootstrapGenerationError(ended)).toEqual(ended.diagnostic);
  });

  // The trap this phase was written around.
  //
  // `parseEvidenceLoopCounts` gates each step with `hasExactFields`, which
  // rejects a record carrying any field it was not told about -- and a rejected
  // step returns `null` for the *whole* diagnostic, so the build's named reason
  // is replaced by a generic transport failure. Widening the step the builder
  // emits without widening that allow-list in lockstep therefore does not make
  // a record arrive short; it makes the record disappear, and the phase buys
  // nothing while every gate stays green. These rows are the proof that the two
  // sides agree, field by field.
  describe("the published step and the allow-list that parses it", () => {
    const widened = {
      code: "flow_bootstrap.evidence_iteration_limit",
      stage: "provider_output_validation",
      // An ending that ran out of turns is retryable, and the reader computes
      // that from the same table the producer writes it from.
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: {
        iterationCount: 2,
        decisionCount: 2,
        toolCallCount: 1,
        evidenceBytes: 640,
        exhausted: { bound: "iterations", maxIterations: 2, iterations: 2, draftSteps: 2, proposableSteps: 1, completionAttempts: 0 },
        steps: [{
          toolId: "web.dom.click",
          iteration: 1,
          callId: "initial.web.dom.click",
          effectApplied: true,
          resultCode: "web.action.rejected.target_unobserved",
          resultReason: "column_not_in_detected_list",
          nodeId: "web.output.dom-click",
          evidenceBytes: 640,
          amended: 1,
          amendmentsRefused: [{ step: 2, reason: "already_so" }],
          progress: { draftRevisionBefore: 1, draftRevisionAfter: 2, pageState: "unchanged", draftState: "changed", answerabilityState: "first_observed" },
          draftChange: { targetedStepIds: ["d1"], appliedCount: 1, refusedCount: 1, keptStepCount: 2 },
          draft: { bytes: 640, budget: 4_096, steps: 2, instructionBytes: 128, unlisted: 1 },
          answerability: { recordsRequested: true, recordProducerPresent: false, recordStorePresent: false, issueCode: "bootstrap.cannot_answer_instruction" },
          at: 1_758_672_000_000,
          usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, cacheHitInputTokens: 700, cacheMissInputTokens: 200, estimatedCostUsd: 0.0004 }
        }]
      }
    };

    it("parses a step carrying every field the step type declares, rather than rejecting the whole diagnostic", () => {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(widened)).toEqual(widened);
    });

    it("still rejects a step carrying a field nothing declares, which is what makes the lockstep matter", () => {
      const step = { ...widened.evidenceLoop.steps[0], promptText: "what the model was shown" };

      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...widened, evidenceLoop: { ...widened.evidenceLoop, steps: [step] } })).toBeNull();
    });

    it("refuses a widened field whose value is out of bounds, so a number cannot arrive as anything it likes", () => {
      const widenedStep = widened.evidenceLoop.steps[0];
      if (!widenedStep) throw new Error("The widened diagnostic fixture must contain its representative step.");
      const bad: Array<Record<string, unknown>> = [
        { iteration: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ROUNDS + 1 },
        { iteration: -1 },
        { evidenceBytes: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxEvidenceBytes + 1 },
        { at: -1 },
        { at: 4_102_444_800_001 },
        { at: 1.5 },
        { callId: "an id with spaces in it" },
        { progress: { ...widenedStep.progress, draftRevisionAfter: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations * 2 + 1 } },
        { draftChange: { ...widenedStep.draftChange, targetedStepIds: ["private id"] } },
        // More listed and unlisted steps than the largest Flow the size setting allows could represent.
        { draft: { ...widenedStep.draft, unlisted: automationStudioFlowBootstrapLargestSizeLimits().maxTotalNodes + AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations + 1 } },
        { answerability: { ...widenedStep.answerability, issueCode: "private prose" } },
        { usage: { inputTokens: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_MAX_ACCOUNTED_TOKENS + 1 } },
        { usage: { estimatedCostUsd: 11 } },
        { usage: { promptText: "what the model was shown" } }
      ];
      for (const override of bad) {
        const step = { ...widened.evidenceLoop.steps[0], ...override };

        expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...widened, evidenceLoop: { ...widened.evidenceLoop, steps: [step] } })).toBeNull();
      }
    });

    it("parses a step written before the widening, so an older record is not thrown away", () => {
      const old = { ...widened, evidenceLoop: { ...widened.evidenceLoop, steps: [{ toolId: "web.dom.click", effectApplied: true, resultCode: "web.action.rejected.target_unobserved" }] } };

      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(old)).toEqual(old);
    });
  });

  it("carries a refused plan's issue codes, bounded, and refuses a record whose codes are not codes", () => {
    const valid = {
      code: "flow_bootstrap.evidence_completion_plan_invalid",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      issueCodes: ["bootstrap.invalid_parameter_value"]
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    for (const issueCodes of [[], ["not a code"], Array.from({ length: 17 }, (_, index) => `bootstrap.code_${index}`), "bootstrap.invalid_parameter_value"]) {
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, issueCodes })).toBeNull();
    }
  });

  it("parses a canonical foreign-constructor error without relying on class identity", () => {
    const diagnostic = {
      code: "flow_bootstrap.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "unknown"
    };
    const foreignError = Object.assign(
      new Error("Flow Bootstrap generation failed (flow_bootstrap.provider_http_error)."),
      { name: "AutomationStudioFlowBootstrapGenerationError", diagnostic, rawResponse: "must not escape" }
    );
    expect(parseAutomationStudioFlowBootstrapGenerationError(foreignError)).toEqual(diagnostic);
  });

  it("rejects spoofed, noncanonical, malformed, and hostile structural errors", () => {
    const diagnostic = {
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received"
    };
    const message = "Flow Bootstrap generation failed (llm.provider_http_error).";
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "OtherError", message, diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ message, diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "AutomationStudioFlowBootstrapGenerationError", message: "raw upstream", diagnostic })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError({ name: "AutomationStudioFlowBootstrapGenerationError", message, diagnostic: { ...diagnostic, rawResponse: "private" } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationError(new Proxy({}, { get: () => { throw new Error("hostile getter"); } }))).toBeNull();
  });

  it("reports provider call and response state truthfully for harness failures", () => {
    const request = { requestId: "request.truth", estimatedInputTokens: 100 } as any;
    expect(flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code: "llm_budget.input_limit_exceeded", message: "private budget detail" }],
      request
    }).diagnostic).toMatchObject({
      code: "flow_bootstrap.pre_provider_input_limit_exceeded",
      stage: "pre_provider_validation",
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      accounting: { requestId: "request.truth", estimatedInputTokens: 100 }
    });
    expect(flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm_output.invalid_provider_result", message: "private output detail" }],
      request,
      provider: { provider: "mock-production", model: "mock-bootstrap" }
    }).diagnostic).toMatchObject({
      stage: "provider_output_validation",
      providerInvocation: "attempted",
      providerResponse: "received"
    });
  });

  it("forwards ambiguous harness provenance instead of inferring an attempt from provider metadata", () => {
    const diagnostic = flowBootstrapHarnessFailure({
      providerInvocation: "unknown",
      diagnostics: [{ severity: "error", code: "llm.provider_timeout", message: "private timeout detail" }],
      request: { requestId: "request.timeout", estimatedInputTokens: 100 } as any,
      provider: { provider: "mock-production", model: "mock-bootstrap" }
    }).diagnostic;

    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.provider_timeout",
      stage: "provider_request",
      providerInvocation: "unknown",
      providerResponse: "not_received"
    });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(diagnostic)).toEqual(diagnostic);
    expect(JSON.stringify(diagnostic)).not.toContain("private timeout detail");
  });

  it("parses back every pre-provider failure Core produces, with accounting only where the harness keeps it", () => {
    const fallback = flowBootstrapPhaseFailure("pre_provider_validation").diagnostic;
    expect(fallback.code).toBe("flow_bootstrap.pre_provider_validation_failed");
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(fallback)).toEqual(fallback);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...fallback,
      accounting: { requestId: "request.private", estimatedInputTokens: 1 }
    })).toBeNull();

    const request = { requestId: "request.harness", estimatedInputTokens: 100 } as any;
    for (const [code, expectedCode] of [
      ["llm_budget.input_limit_exceeded", "flow_bootstrap.pre_provider_input_limit_exceeded"],
      ["bootstrap.catalog_empty", "flow_bootstrap.pre_provider_context_invalid"],
      ["llm.private_unrecognised", "flow_bootstrap.harness_preflight_failed"]
    ] as const) {
      const harness = flowBootstrapHarnessFailure({ diagnostics: [{ severity: "error", code, message: "private" }], request, providerInvocation: "not_attempted" }).diagnostic;
      expect(harness.code).toBe(expectedCode);
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(harness)).toEqual(harness);
      const { accounting: _accounting, ...withoutAccounting } = harness;
      expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(withoutAccounting)).toBeNull();
    }
  });

  it("projects length-limited provider output to the exact sanitized output-validation diagnostic", () => {
    const partialContent = '{"kind":"flow_bootstrap","private":"must not escape"';
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_output_truncated", message: partialContent, metadata: { rawResponse: partialContent } }],
      request: { requestId: "request.truncated", estimatedInputTokens: 1_996 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" },
      usage: { inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_truncated",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.truncated", estimatedInputTokens: 1_996, provider: "deepseek", model: "deepseek-flash", inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });
    expect(JSON.stringify(failure)).not.toContain(partialContent);
  });

  it("projects structurally invalid provider output without exposing provider content or issue paths", () => {
    const privateDetail = "plan.subflows[0].nodes[0].private";
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_output_invalid", message: privateDetail, metadata: { rawResponse: privateDetail } }],
      request: { requestId: "request.invalid-output", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_invalid",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.invalid-output", estimatedInputTokens: 1_000, provider: "deepseek", model: "deepseek-flash" }
    });
    expect(JSON.stringify(failure)).not.toContain(privateDetail);
  });

  it("does not let an earlier instruction diagnostic mask the appended provider failure", () => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [
        { severity: "error", code: "instruction.invalid_scope", message: "private instruction detail" },
        { severity: "error", code: "llm.provider_request_limits_invalid", message: "private provider detail", metadata: { retryable: false } }
      ],
      request: { requestId: "request.ordered", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });
    expect(failure.diagnostic).toMatchObject({
      code: "flow_bootstrap.provider_request_limits_invalid",
      stage: "provider_request",
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(JSON.stringify(failure)).not.toMatch(/private instruction|private provider/);
  });

  // They were one code on both sides, so a Flow bootstrap refused before its
  // request was sent could not say which check refused it.
  it.each(AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES)("keeps the provider's pre-flight refusal %s as its own parseable code", (code) => {
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "not_attempted",
      diagnostics: [{ severity: "error", code, message: "private provider detail", metadata: { retryable: false } }],
      request: { requestId: "request.refused", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });
    expect(failure.diagnostic).toMatchObject({
      code: code.replace(/^llm\./u, "flow_bootstrap."),
      stage: "provider_request",
      retryable: false,
      providerResponse: "not_received"
    });
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(failure.diagnostic)).toEqual(failure.diagnostic);
  });

  it("still parses a stored diagnostic carrying the retired combined refusal code", () => {
    const stored = { code: "flow_bootstrap.provider_configuration_invalid", stage: "provider_request", retryable: false, providerInvocation: "attempted", providerResponse: "not_received" };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(stored)).toEqual(stored);
  });

  it("projects valid but over-limit provider usage without exposing raw counts", () => {
    const privateUsage = "prompt=2001 completion=512 total=2513";
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_usage_limit_exceeded", message: privateUsage, metadata: { rawUsage: privateUsage } }],
      request: { requestId: "request.usage-limit", estimatedInputTokens: 1_000 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_usage_limit_exceeded",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.usage-limit", estimatedInputTokens: 1_000, provider: "deepseek", model: "deepseek-flash" }
    });
    expect(JSON.stringify(failure)).not.toContain(privateUsage);
  });

  it("projects padding-only truncation without exposing provider content", () => {
    const providerContent = " \n\t ";
    const failure = flowBootstrapHarnessFailure({
      providerInvocation: "attempted",
      diagnostics: [{ severity: "error", code: "llm.provider_output_padding_truncated", message: providerContent, metadata: { rawResponse: providerContent } }],
      request: { requestId: "request.padding", estimatedInputTokens: 1_996 } as any,
      provider: { provider: "deepseek", model: "deepseek-flash" },
      usage: { inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });

    expect(failure.diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_padding_truncated",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.padding", estimatedInputTokens: 1_996, provider: "deepseek", model: "deepseek-flash", inputTokens: 1_996, outputTokens: 512, totalTokens: 2_508 }
    });
    expect(Object.values(failure.diagnostic)).not.toContain(providerContent);
  });

  it("enforces fixed reason-code stage semantics and falls back on cross-stage construction", () => {
    const valid = {
      code: "flow_bootstrap.active_instructions_required",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    };
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(valid)).toEqual(valid);
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, stage: "provider_resolution" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, retryable: true })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, providerInvocation: "attempted" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...valid, providerResponse: "unknown" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({
      ...valid,
      accounting: { requestId: "request.private", estimatedInputTokens: 1 }
    })).toBeNull();

    expect(flowBootstrapPhaseFailure(
      "provider_resolution",
      undefined,
      "flow_bootstrap.invalid_input" as any
    ).diagnostic).toEqual({
      code: "flow_bootstrap.provider_resolution_failed",
      stage: "provider_resolution",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
  });
});
