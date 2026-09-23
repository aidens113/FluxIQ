// A run's receipt, one line per provider call.
//
// The run ledger has always known the totals. What it did not keep was which
// call made them up, so an iterating recovery's evidence calls -- which leave
// no intervention -- could be counted and never seen. These pin the three
// things a line must be: present for every call the ledger counts and for
// nothing else, honest about which figures the provider reported and which
// the ledger assumed, and bounded to identifiers, codes and numbers.

import { describe, expect, it } from "vitest";
import { runAutomationStudioLlmHarness, type AutomationStudioLlmProvider } from "../harness.ts";
import { AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT, AutomationStudioLlmRunBudgetLedger } from "../run-budget.ts";
import { automationStudioLlmRunCallRecord } from "../run-call-record.ts";

const RESERVED = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.1 };

function ledger(maxCallsPerRun?: number): AutomationStudioLlmRunBudgetLedger {
  return new AutomationStudioLlmRunBudgetLedger({ ...(maxCallsPerRun ? { maxCallsPerRun } : {}), maxTotalTokensPerRun: 10_000_000, maxOutputTokensPerRun: 10_000_000, maxEstimatedCostUsdPerRun: 10 });
}

function reserve(budget: AutomationStudioLlmRunBudgetLedger, requestId: string, extra: Partial<Parameters<AutomationStudioLlmRunBudgetLedger["reserve"]>[0]> = {}) {
  const reservation = budget.reserve({ runId: "run.receipt", requestId, estimatedInputTokens: RESERVED.inputTokens, maxOutputTokens: RESERVED.outputTokens, maxEstimatedCostUsd: RESERVED.estimatedCostUsd, ...extra });
  if (!reservation.ok) throw new Error(reservation.diagnostic.code);
  return reservation.lease;
}

describe("the run ledger's per-call receipt", () => {
  it("itemizes every counted call in order, and the lines add up to the snapshot", () => {
    const budget = ledger();
    reserve(budget, "request.diagnosis", { call: { taskKind: "runtime_diagnosis", stage: "gather", promptVersion: "automation-studio.runtime-diagnosis.v1+stage.gather", provider: "deepseek", model: "deepseek-flash" } })
      .complete({ inputTokens: 40, outputTokens: 10, totalTokens: 50, estimatedCostUsd: 0.001 }, { validationOk: true, issueCodes: [] });
    // A hold no call spends has no line.
    reserve(budget, "recovery.patch-reserve").release();
    // An evidence call whose provider reported nothing is charged its reservation, and says so.
    reserve(budget, "request.evidence", { allowance: "exploration", call: { taskKind: "evidence_tool_decision", stage: "gather", promptVersion: "automation-studio.evidence-tool-decision.v1+stage.gather", provider: "deepseek", model: "deepseek-flash" } })
      .complete(undefined, { validationOk: false, issueCodes: ["llm.provider_timeout"] });
    // Tokens reported but no cost: the tokens are the provider's, the cost is the reservation's.
    reserve(budget, "request.patch", { call: { taskKind: "runtime_patch", stage: "implement", promptVersion: "automation-studio.runtime-patch.v1+stage.implement", provider: "deepseek", model: "deepseek-flash" } })
      .complete({ inputTokens: 60, outputTokens: 20, totalTokens: 80 }, { validationOk: true, issueCodes: [] });

    const receipt = budget.callRecords("run.receipt");
    expect(receipt.omitted).toBe(0);
    expect(receipt.calls).toEqual([
      {
        sequence: 1, requestId: "request.diagnosis", taskKind: "runtime_diagnosis", stage: "gather", allowance: "run",
        promptVersion: "automation-studio.runtime-diagnosis.v1+stage.gather", provider: "deepseek", model: "deepseek-flash",
        validation: { ok: true, issueCodes: [] },
        reported: { inputTokens: 40, outputTokens: 10, totalTokens: 50, estimatedCostUsd: 0.001 },
        charged: { inputTokens: 40, outputTokens: 10, totalTokens: 50, estimatedCostUsd: 0.001, tokens: "reported", cost: "reported" },
        budgetBreach: false
      },
      {
        sequence: 2, requestId: "request.evidence", taskKind: "evidence_tool_decision", stage: "gather", allowance: "exploration",
        promptVersion: "automation-studio.evidence-tool-decision.v1+stage.gather", provider: "deepseek", model: "deepseek-flash",
        validation: { ok: false, issueCodes: ["llm.provider_timeout"] },
        reported: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null },
        charged: { ...RESERVED, tokens: "reserved", cost: "reserved" },
        budgetBreach: false
      },
      {
        sequence: 3, requestId: "request.patch", taskKind: "runtime_patch", stage: "implement", allowance: "run",
        promptVersion: "automation-studio.runtime-patch.v1+stage.implement", provider: "deepseek", model: "deepseek-flash",
        validation: { ok: true, issueCodes: [] },
        reported: { inputTokens: 60, outputTokens: 20, totalTokens: 80, estimatedCostUsd: null },
        charged: { inputTokens: 60, outputTokens: 20, totalTokens: 80, estimatedCostUsd: RESERVED.estimatedCostUsd, tokens: "reported", cost: "reserved" },
        budgetBreach: false
      }
    ]);
    const snapshot = budget.snapshot("run.receipt");
    const sum = (key: "inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd") => receipt.calls.reduce((total, call) => total + call.charged[key], 0);
    expect({ calls: receipt.calls.length, explorationCalls: receipt.calls.filter((call) => call.allowance === "exploration").length, inputTokens: sum("inputTokens"), outputTokens: sum("outputTokens"), totalTokens: sum("totalTokens"), estimatedCostUsd: sum("estimatedCostUsd") })
      .toEqual({ calls: snapshot.calls, explorationCalls: snapshot.explorationCalls, inputTokens: snapshot.inputTokens, outputTokens: snapshot.outputTokens, totalTokens: snapshot.totalTokens, estimatedCostUsd: snapshot.estimatedCostUsd });
  });

  it("still itemizes a call settled without a description or an outcome, leaving both unknown", () => {
    const budget = ledger();
    reserve(budget, "request.bare").complete();

    expect(budget.callRecords("run.receipt").calls).toEqual([expect.objectContaining({
      sequence: 1, requestId: "request.bare", taskKind: null, stage: null, allowance: "run", promptVersion: null, provider: null, model: null, validation: null
    })]);
    expect(budget.callRecords("run.none")).toEqual({ calls: [], omitted: 0 });
  });

  it("marks a line whose reported use overran its reservation as the breach the snapshot counts", () => {
    const budget = ledger();
    reserve(budget, "request.over").complete({ inputTokens: 180, outputTokens: 60, totalTokens: 240, estimatedCostUsd: 0.2 });

    expect(budget.callRecords("run.receipt").calls[0]).toMatchObject({ budgetBreach: true, charged: { totalTokens: 240, estimatedCostUsd: 0.2, tokens: "reported", cost: "reported" } });
    expect(budget.snapshot("run.receipt").budgetBreaches).toBe(1);
  });

  it("keeps at most the record limit and says how many calls it left out", () => {
    const budget = ledger(AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT + 3);
    for (let index = 0; index < AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT + 3; index += 1) {
      reserve(budget, `request.${index}`, { maxEstimatedCostUsd: 0.000_001 }).complete({ inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0 });
    }

    const receipt = budget.callRecords("run.receipt");
    expect(receipt.calls).toHaveLength(AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT);
    expect(receipt.omitted).toBe(3);
    expect(receipt.calls.at(-1)?.sequence).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT);
    expect(budget.snapshot("run.receipt").calls).toBe(AUTOMATION_STUDIO_LLM_RUN_CALL_RECORD_LIMIT + 3);
  });

  it("hands out copies, so a reader cannot rewrite the receipt", () => {
    const budget = ledger();
    reserve(budget, "request.one").complete({ inputTokens: 1, outputTokens: 1, totalTokens: 2 }, { validationOk: true, issueCodes: [] });
    const first = budget.callRecords("run.receipt").calls[0]!;
    first.charged.totalTokens = 999;
    first.validation!.issueCodes.push("tampered");

    expect(budget.callRecords("run.receipt").calls[0]).toMatchObject({ charged: { totalTokens: 2 }, validation: { issueCodes: [] } });
  });
});

describe("one call's line", () => {
  const charged = { ...RESERVED, tokens: "reserved" as const, cost: "reserved" as const };

  it("keeps identifiers, codes and numbers only, each bounded", () => {
    const record = automationStudioLlmRunCallRecord({
      sequence: 1,
      requestId: "request.one",
      allowance: "run",
      description: { taskKind: "not_a_task" as never, stage: "wander" as never, promptVersion: "prompt with spaces", provider: "evil\nprovider", model: "m".repeat(201) },
      outcome: {
        validationOk: false,
        issueCodes: ["llm.provider_timeout", "llm.provider_timeout", "The provider said: <secret page text>", "", ...Array.from({ length: 30 }, (_, index) => `code.${index}`)]
      },
      usage: { inputTokens: -1, outputTokens: 1.5, totalTokens: Number.NaN, estimatedCostUsd: Number.POSITIVE_INFINITY },
      charged,
      budgetBreach: false
    });

    expect(record).toMatchObject({ taskKind: null, stage: null, promptVersion: null, provider: null, model: null });
    expect(record.validation?.issueCodes[0]).toBe("llm.provider_timeout");
    expect(record.validation?.issueCodes).toHaveLength(16);
    expect(record.validation?.issueCodes.join(" ")).not.toContain("secret");
    expect(record.reported).toEqual({ inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null });
  });

  it("reads a staged prompt version and a zero figure as the provider gave them", () => {
    const record = automationStudioLlmRunCallRecord({
      sequence: 2,
      requestId: "request.two",
      allowance: "exploration",
      description: { taskKind: "evidence_tool_decision", stage: "gather", promptVersion: "automation-studio.evidence-tool-decision.v1+stage.gather", provider: "deepseek", model: "deepseek-flash" },
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
      charged,
      budgetBreach: false
    });

    expect(record).toMatchObject({ taskKind: "evidence_tool_decision", stage: "gather", promptVersion: "automation-studio.evidence-tool-decision.v1+stage.gather", validation: null });
    expect(record.reported).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });
  });
});

describe("the harness's line for each call", () => {
  function call(budget: AutomationStudioLlmRunBudgetLedger, requestId: string, provider: AutomationStudioLlmProvider, maxOutputTokens = 2_000) {
    return runAutomationStudioLlmHarness({
      taskKind: "runtime_diagnosis",
      stage: "gather",
      projectId: "project.llm",
      flowId: "flow.checkout",
      runId: "run.receipt",
      requestId,
      instructions: [],
      provider,
      runBudget: budget,
      tokenLimits: { maxInputTokens: 8_000, maxOutputTokens, maxTotalTokens: 8_000 + maxOutputTokens },
      maxEstimatedCostUsd: 0.1
    });
  }
  const answer = { response: { kind: "diagnosis", summary: "The control moved." } };

  it("describes a staged call, and records how it ended", async () => {
    const budget = ledger();
    const answered = await call(budget, "request.answered", { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => ({ ...answer, usage: { inputTokens: 300, outputTokens: 40, totalTokens: 340, estimatedCostUsd: 0.0002 } }) });
    const failed = await call(budget, "request.failed", { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => { throw new Error("socket closed with private detail"); } });
    const garbled = await call(budget, "request.garbled", { metadata: { provider: "deepseek", model: "deepseek-flash" }, runTask: async () => ({ response: { kind: "diagnosis" }, stray: true }) });

    expect([answered.ok, failed.ok, garbled.ok]).toEqual([true, false, false]);
    const [first, second, third] = budget.callRecords("run.receipt").calls;
    expect(first).toMatchObject({
      requestId: "request.answered", taskKind: "runtime_diagnosis", stage: "gather", allowance: "run",
      promptVersion: "automation-studio.runtime-diagnosis.v1+stage.gather", provider: "deepseek", model: "deepseek-flash",
      validation: { ok: true, issueCodes: [] },
      reported: { inputTokens: 300, outputTokens: 40, totalTokens: 340, estimatedCostUsd: 0.0002 },
      charged: { tokens: "reported", cost: "reported" }
    });
    expect(second).toMatchObject({ requestId: "request.failed", validation: { ok: false }, reported: { totalTokens: null }, charged: { totalTokens: 10_000, tokens: "reserved", cost: "reserved" } });
    expect(second?.validation?.issueCodes).toEqual(failed.diagnostics.map((diagnostic) => diagnostic.code));
    expect(JSON.stringify(second)).not.toContain("private detail");
    expect(third).toMatchObject({ requestId: "request.garbled", validation: { ok: false } });
    expect(third?.validation?.issueCodes.length).toBeGreaterThan(0);
    // The intervention the harness returns agrees with the line about how the call went.
    expect(answered.intervention.validation?.ok).toBe(first?.validation?.ok);
  });

  // The harness used to withhold a report over the request's limits, so the
  // ledger charged the smaller reservation and never counted the breach.
  it("charges a reported overage as reported and counts it as a breach", async () => {
    const budget = ledger();
    const result = await call(budget, "request.overage", { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ ...answer, usage: { inputTokens: 500, outputTokens: 90, totalTokens: 590 } }) }, 50);

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_usage.output_limit_exceeded");
    expect(budget.callRecords("run.receipt").calls).toEqual([expect.objectContaining({
      validation: { ok: false, issueCodes: ["llm_usage.output_limit_exceeded"] },
      reported: { inputTokens: 500, outputTokens: 90, totalTokens: 590, estimatedCostUsd: null },
      charged: expect.objectContaining({ outputTokens: 90, totalTokens: 590, tokens: "reported", cost: "reserved" }),
      budgetBreach: true
    })]);
    expect(budget.snapshot("run.receipt")).toMatchObject({ outputTokens: 90, totalTokens: 590, budgetBreaches: 1 });
  });

  it("writes no line for a call the ledger refused, because no provider was asked", async () => {
    const budget = new AutomationStudioLlmRunBudgetLedger({ maxCallsPerRun: 1, maxTotalTokensPerRun: 100_000, maxOutputTokensPerRun: 100_000, maxEstimatedCostUsdPerRun: 1 });
    let asked = 0;
    const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => { asked += 1; return answer; } };
    await call(budget, "request.first", provider);
    const refused = await call(budget, "request.second", provider);

    expect(refused.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_budget.run_call_limit");
    expect(asked).toBe(1);
    expect(budget.callRecords("run.receipt").calls.map((line) => line.requestId)).toEqual(["request.first"]);
  });
});
