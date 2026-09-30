// A re-author that fails must be retried or degraded, never silently ended.
// `run-mulxk0ro-36bf090d`'s repair failed inside the build before any provider
// call, recorded `flow_bootstrap.unexpected_error`, and did nothing more.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AutomationStudioFlowBootstrapGenerationError, flowBootstrapPhaseFailure } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioLlmRequestRefusedError } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  automationStudioResultRepairHistoryEntry
} from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioRefutedResultRepairPort, type AutomationStudioRefutedResultRepairPortDependencies } from "../refuted-result-port.ts";

const summary: AutomationStudioRunResultSummary = {
  schemaVersion: "automation-studio.run-result-summary.v1",
  totalRecordCount: 10, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
  recordSets: [{ datasetId: "dataset.1", recordCount: 10, refusedCount: 0, truncated: false, columns: ["title", "price"], columnsWithheld: false, rowsChecked: 10, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: [{ title: "Oak dining table" }] }],
  flowShape: [{ nodeId: "node.s6", definitionId: "web.output.dom-extract_list" }],
  withheld: false
};

const outcome: AutomationStudioResultVerificationOutcome = {
  schemaVersion: "automation-studio.result-verification.v1",
  performed: true, verdict: "does_not_answer", basis: "model", code: AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  reason: "The result was judged not to answer the request.", observation: "10 records stored, across 1 record set."
};

const detail = {
  summary: { runId: "run.one", status: "failed" },
  metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code: AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE } }
} as unknown as AutomationStudioFlowRunDetail;

const request = {
  detail,
  failedTraceAttempt: {} as never,
  resultSummary: summary,
  current: automationStudioResultRepairHistoryEntry({ attempt: 1, outcome, summary, nodeId: "node.s6" }),
  history: [],
  maxAttempts: 3
};

const caller = { actorUserId: "user.one", actorSessionId: "session.one" };

function deps(overrides: Partial<AutomationStudioRefutedResultRepairPortDependencies>): AutomationStudioRefutedResultRepairPortDependencies & { annotate: ReturnType<typeof vi.fn> } {
  return {
    projectId: "project.one",
    flowId: () => "flow.one",
    caller,
    annotate: vi.fn(async (refuted) => ({ ...refuted.detail, metadata: { ...(refuted.detail.metadata ?? {}), ladder: "annotated" } })),
    generate: async () => ({ adaptationId: "adaptation.one", accounting: {} }) as never,
    approve: async () => undefined,
    apply: async () => undefined,
    now: () => 0,
    ...overrides
  } as AutomationStudioRefutedResultRepairPortDependencies & { annotate: ReturnType<typeof vi.fn> };
}

function marker(result: AutomationStudioFlowRunDetail | undefined): Record<string, any> {
  return (result?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] ?? {}) as Record<string, any>;
}

describe("the caller a re-author builds for", () => {
  // The build pays with the run's own caller's key and carries the consequences
  // the caller permitted; nothing else is asked of it. After it applies, the run
  // just replays.
  it("builds for the run's caller, applies, and leaves the run ready to replay", async () => {
    const generate = vi.fn(async () => ({ adaptationId: "adaptation.one", accounting: {} }));
    const apply = vi.fn(async () => undefined);
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, apply, permittedConsequences: ["create_new"] }))(request);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((generate.mock.calls[0] as unknown[])[0]).toEqual({ projectId: "project.one", flowId: "flow.one", mode: "extend", evidenceGuided: true, caller, permittedConsequences: ["create_new"] });
    expect(apply).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.one", actorId: "runtime.result_repair" });
    expect(marker(result)).toMatchObject({ routed: true, applied: true });
    expect(marker(result).replayReady).toBeUndefined();
    expect(marker(result).degraded).toBeUndefined();
  });
});

describe("a re-author whose build fails", () => {
  it("names the guard that refused the request and degrades to the patch ladder instead of ending", async () => {
    const generate = vi.fn(async () => { throw new AutomationStudioLlmRequestRefusedError("llm.request.evidence_denied_key", "refused"); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);
    expect(marker(result)).toMatchObject({
      routed: true,
      code: "flow_bootstrap.request_refused_evidence_denied_key",
      stage: "pre_provider_validation",
      providerInvocation: "not_attempted",
      degraded: { to: "patch_ladder", afterCode: "flow_bootstrap.request_refused_evidence_denied_key" }
    });
    // A guard refusal would refuse again, so it is not retried.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).toHaveBeenCalledTimes(1);
    expect(result?.metadata?.ladder).toBe("annotated");
  });

  it("names a run with no caller as a provider that could not resolve", async () => {
    const result = await automationStudioRefutedResultRepairPort(deps({ caller: undefined }))(request);
    expect(marker(result)).toMatchObject({ code: "flow_bootstrap.provider_resolution_failed", stage: "provider_resolution", degraded: { to: "patch_ladder" } });
  });

  it("builds again once after a failure that may pass, and applies what the second build made", async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw flowBootstrapPhaseFailure("provider_request", undefined, "flow_bootstrap.provider_timeout");
      return { adaptationId: "adaptation.two", accounting: {} };
    });
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(marker(result)).toMatchObject({ routed: true, adaptationId: "adaptation.two", applied: true });
    expect(marker(result).degraded).toBeUndefined();
    expect(marker(result).attempts).toHaveLength(2);
    expect(marker(result).attempts[0]).toMatchObject({ code: "flow_bootstrap.provider_timeout", retryable: true });
  });

  it("still says what it tried when the patch ladder throws as well", async () => {
    const port = deps({
      generate: (async () => { throw new AutomationStudioLlmRequestRefusedError("llm.request.routing_denied_key", "refused"); }) as never,
      annotate: vi.fn(async () => { throw new Error("ladder down"); }) as never
    });
    const result = await automationStudioRefutedResultRepairPort(port)(request);
    expect(marker(result)).toMatchObject({ code: "flow_bootstrap.request_refused_routing_denied_key", degraded: { to: "patch_ladder", failed: true } });
  });
});

// The user's rule: a build, and its repair, each spend at most $0.25 in total,
// lowered and never raised by the Flow's own setting. Each part of the repair
// was held to $0.25 on its own, so one repair -- a build, the build again, the
// patch ladder -- could spend about $0.75.
describe("the repair's one purse", () => {
  /** A build that ran out of turns having reported `costUsd`: a failure that may pass, so it is built again. */
  const outOfTurns = (costUsd: number) => flowBootstrapPhaseFailure("provider_output_validation", { requestId: `request.${costUsd}`, estimatedInputTokens: 10, estimatedCostUsd: costUsd }, "flow_bootstrap.evidence_iteration_limit");
  /** What the recovery's own gate record says it spent, as `annotate.ts` writes it. */
  const ladderSpending = (costUsd: number) => vi.fn(async (refuted: { detail: AutomationStudioFlowRunDetail }) => ({ ...refuted.detail, metadata: { ...(refuted.detail.metadata ?? {}), llmGate: { invoked: true, costAccounting: { calls: 1, estimatedCostUsd: costUsd } } } }));

  it("hands a re-author retry only what the first build left: $0.05 after $0.20", async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw outOfTurns(0.2);
      return { adaptationId: "adaptation.two", accounting: { requestId: "request.two", estimatedInputTokens: 10, estimatedCostUsd: 0.04 } };
    });
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect((generate.mock.calls as unknown[][]).map((call) => call[2])).toEqual([0.25, 0.05]);
    expect(marker(result)).toMatchObject({ applied: true, purse: { limitUsd: 0.25, spentUsd: 0.24, leftUsd: 0.01 } });
  });

  it("does not run the patch ladder once the re-authors have spent the purse, and names cost as why", async () => {
    const spent = [0.15, 0.1];
    const generate = vi.fn(async () => { throw outOfTurns(spent.shift()!); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect((generate.mock.calls as unknown[][]).map((call) => call[2])).toEqual([0.25, 0.1]);
    // The ladder is a recovery that asks a model; it was not called at all.
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result)).toMatchObject({
      degraded: { to: "patch_ladder", afterCode: "flow_bootstrap.evidence_iteration_limit", bound: "cost" },
      purse: { limitUsd: 0.25, spentUsd: 0.25, leftUsd: 0, refusedParts: ["patch_ladder"], bound: "cost" }
    });
  });

  it("does not build again when the first build spent the purse, and records the retry it did not make", async () => {
    const generate = vi.fn(async () => { throw outOfTurns(0.25); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result).attempts).toHaveLength(2);
    expect(marker(result).attempts[1]).toMatchObject({ code: "llm_budget.run_cost_limit", retryable: false, providerInvocation: "not_attempted" });
    expect(marker(result).purse).toMatchObject({ spentUsd: 0.25, refusedParts: ["reauthor", "patch_ladder"], bound: "cost" });
  });

  it("caps the whole repair at a Flow's $0.10, re-author, retry and patch ladder together", async () => {
    const spent = [0.07, 0.02];
    const generate = vi.fn(async () => { throw outOfTurns(spent.shift()!); });
    const annotate = ladderSpending(0.01);
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, annotate: annotate as never, maxCostUsd: () => 0.1 }))(request);

    const handed = [...(generate.mock.calls as unknown[][]).map((call) => call[2]), ...(annotate.mock.calls as unknown[][]).map((call) => call[1])];
    expect(handed).toEqual([0.1, 0.03, 0.01]);
    expect(marker(result)).toMatchObject({ degraded: { to: "patch_ladder" }, purse: { limitUsd: 0.1, spentUsd: 0.1, leftUsd: 0 } });
    expect(marker(result).degraded.bound).toBeUndefined();
  });

  // A part handed a sliver would still spend a whole call past the total: the
  // build's loop always allows its first decision, and the recovery's ledger
  // charges a call what it actually cost. So a later part starts only when what
  // is left covers one more call at what the repair's calls have cost so far.
  it("starts no later part whose remainder would not cover one more call at the repair's average", async () => {
    const generate = vi.fn(async () => {
      throw new AutomationStudioFlowBootstrapGenerationError({
        code: "flow_bootstrap.evidence_iteration_limit", stage: "provider_output_validation", retryable: true, providerInvocation: "attempted", providerResponse: "received",
        accounting: { requestId: "request.loop", estimatedInputTokens: 10, estimatedCostUsd: 0.2 },
        evidenceLoop: { iterationCount: 2, decisionCount: 2, toolCallCount: 2, evidenceBytes: 100 }
      });
    });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    // $0.05 is left, and the build's two decisions cost $0.10 each.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result).attempts[0]).toMatchObject({ code: "flow_bootstrap.evidence_iteration_limit", retryable: true });
    expect(marker(result).purse).toMatchObject({ spentUsd: 0.2, leftUsd: 0.05, averagedCalls: 2, averagedUsd: 0.2, refusedParts: ["reauthor", "patch_ladder"], bound: "cost" });
  });

  it("is never raised by a Flow set above the ceiling", async () => {
    const generate = vi.fn(async () => ({ adaptationId: "adaptation.one", accounting: {} }));
    await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, maxCostUsd: () => 1 }))(request);
    expect((generate.mock.calls as unknown[][])[0]![2]).toBe(0.25);
  });

  it("opens where the run's earlier passes left it, so a re-run refuted again spends from the same total", async () => {
    const generate = vi.fn(async () => ({ adaptationId: "adaptation.three", accounting: { requestId: "request.three", estimatedInputTokens: 10, estimatedCostUsd: 0.01 } }));
    const earlier = { ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { routed: true, applied: true, purse: { limitUsd: 0.25, spentUsd: 0.18, leftUsd: 0.07 } } } } as AutomationStudioFlowRunDetail;
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))({ ...request, detail: earlier });

    expect((generate.mock.calls as unknown[][])[0]![2]).toBe(0.07);
    expect(marker(result).purse).toMatchObject({ spentUsd: 0.19, leftUsd: 0.06 });
  });

  it("gives a refutation the route does not take the patch ladder with what is left, and nothing once it is spent", async () => {
    const notWrongAnswer = { ...request, detail: { ...detail, metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code: "core.result.unconfirmed" } } } as unknown as AutomationStudioFlowRunDetail };
    const annotate = ladderSpending(0.02);
    const first = await automationStudioRefutedResultRepairPort(deps({ annotate: annotate as never }))(notWrongAnswer);
    expect((annotate.mock.calls as unknown[][])[0]![1]).toBe(0.25);
    expect(marker(first)).toMatchObject({ routed: false, purse: { spentUsd: 0.02 } });

    const spentDetail = { ...notWrongAnswer.detail, metadata: { ...(notWrongAnswer.detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { purse: { limitUsd: 0.25, spentUsd: 0.25 } } } } as AutomationStudioFlowRunDetail;
    const spentLadder = ladderSpending(0.02);
    const second = await automationStudioRefutedResultRepairPort(deps({ annotate: spentLadder as never }))({ ...notWrongAnswer, detail: spentDetail });
    expect(spentLadder).not.toHaveBeenCalled();
    expect(marker(second).purse).toMatchObject({ refusedParts: ["patch_ladder"], bound: "cost" });
  });
});
