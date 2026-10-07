// A re-author that fails must be retried or degraded, never silently ended.
// `run-mulxk0ro-36bf090d`'s repair failed inside the build before any provider
// call, recorded `flow_bootstrap.unexpected_error`, and did nothing more.
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AutomationStudioFlowBootstrapGenerationError, automationStudioFlowBootstrapGenerationCatch, flowBootstrapBuildEndingFailure, flowBootstrapPhaseFailure } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, AutomationStudioLlmRequestRefusedError, automationStudioLlmRunCostCeilingUsd } from "../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID,
  AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  automationStudioRefutedResultRerunsFlow,
  automationStudioResultRepairHistoryEntry,
  type AutomationStudioReauthorEndingWatch
} from "../../../recovery/refuted-result/index.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { automationStudioRefutedResultRepairPort, type AutomationStudioRefutedResultRepairPortDependencies } from "../refuted-result-port.ts";
import { automationStudioReauthorProposed } from "./reauthor-proposal.ts";

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
    generate: async () => automationStudioReauthorProposed("adaptation.one", {}) as never,
    approve: async () => undefined,
    now: () => 0,
    ...overrides
  } as AutomationStudioRefutedResultRepairPortDependencies & { annotate: ReturnType<typeof vi.fn> };
}

function marker(result: AutomationStudioFlowRunDetail | undefined): Record<string, any> {
  return (result?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] ?? {}) as Record<string, any>;
}

describe("the caller a re-author builds for", () => {
  // The build pays with the run's own caller's key and carries the consequences
  // the caller permitted; nothing else is asked of it. The edit is approved and
  // held (t267): the re-run runs it unapplied, and its judged end applies it.
  it("builds for the run's caller, approves and holds the edit, and leaves the run ready to re-run", async () => {
    const generate = vi.fn(async () => automationStudioReauthorProposed("adaptation.one", {}));
    const approve = vi.fn(async () => undefined);
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, approve, permittedConsequences: ["create_new"] }))(request);
    expect(generate).toHaveBeenCalledTimes(1);
    expect((generate.mock.calls[0] as unknown[])[0]).toEqual({ projectId: "project.one", flowId: "flow.one", mode: "extend", evidenceGuided: true, caller, permittedConsequences: ["create_new"] });
    expect(approve).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.one", actorId: "runtime.result_repair" });
    expect(marker(result)).toMatchObject({ routed: true, held: true });
    expect(marker(result).applied).toBeUndefined();
    expect(marker(result).replayReady).toBeUndefined();
    expect(marker(result).degraded).toBeUndefined();
  });
});

// Live run `run-murwcmx2-a1c6edf7` (t194, cause C-D): the re-author reran the
// Flow's list read where the refuted run left the page (results page 5). The
// build is handed where each node's first attempt started, read off the run.
describe("where the refuted run's nodes started", () => {
  it("hands the build each node's first-attempt start page, as the host stated it", async () => {
    const generate = vi.fn(async () => automationStudioReauthorProposed("adaptation.one", {}));
    const started = (location: string) => ({ stateRefs: { beforeAction: { stateSnapshotId: "s", stateRef: "r", capturedAt: 1, from: { location } } } });
    const withAttempts = {
      ...detail,
      actionAttempts: [
        { attemptId: "a.2", nodeId: "node.s7", definitionId: "web.output.dom-extract_list", order: 2, status: "failed", startedAt: 2, metadata: started("https://shop.test/s?k=earbuds&page=5") },
        { attemptId: "a.1", nodeId: "node.s7", definitionId: "web.output.dom-extract_list", order: 1, status: "failed", startedAt: 1, metadata: started("https://shop.test/s?k=earbuds") },
        { attemptId: "a.0", nodeId: "node.s6", definitionId: "web.output.dom-click", order: 0, status: "succeeded", startedAt: 0 }
      ]
    } as unknown as AutomationStudioFlowRunDetail;
    await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))({ ...request, detail: withAttempts });
    expect((generate.mock.calls[0] as unknown[])[3]).toEqual({ "node.s7": { location: "https://shop.test/s?k=earbuds" } });
  });

  it("hands the build no start pages when the run's host recorded none", async () => {
    const generate = vi.fn(async () => automationStudioReauthorProposed("adaptation.one", {}));
    await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);
    expect((generate.mock.calls[0] as unknown[])[3]).toEqual({});
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

  it("builds again once after a failure that may pass, and holds what the second build made", async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw flowBootstrapPhaseFailure("provider_request", undefined, "flow_bootstrap.provider_timeout");
      return automationStudioReauthorProposed("adaptation.two", {});
    });
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(marker(result)).toMatchObject({ routed: true, adaptationId: "adaptation.two", held: true });
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

// The user's rule: a build, and its repair, each spend at most the run cost
// ceiling in total. Each part of the repair was held to the ceiling on its own,
// so one repair -- a build, the build again, the patch ladder -- could spend
// about three times it. Since t261 (2026-10-03) the ordinary default is $0.25,
// the $0.10 knob binds only a test-scoped (Lab) runtime, and a Flow's own
// explicit limit is the user's policy: it replaces the default, bounded only by
// a test ceiling and the server maximum (`llm/flow-execution-limits/run-cost-ceiling.ts`).
//
// Since t262 the build is retried only after a named transient provider request
// failure (`reauthor-build.ts`); an iteration or budget ending is continued by a
// person, never rebuilt automatically. So the retry here follows a rate limit.
//
// Amounts are fractions of the ceiling, rounded to the billionth as the purse
// rounds, so the scenarios hold whatever the ceiling is set to.
describe("the repair's one purse", () => {
  const CEILING = AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD;
  const usd = (value: number): number => Math.round(value * 1_000_000_000) / 1_000_000_000;
  /**
   * A build the provider rate-limited, having reported `costUsd` (and, where
   * given, made `decisions` decisions first): a transient request failure, so it
   * is built again once.
   */
  const rateLimited = (costUsd: number, decisions?: number) => new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.provider_rate_limited", stage: "provider_request", retryable: true, providerInvocation: "attempted", providerResponse: "received",
    accounting: { requestId: `request.${costUsd}`, estimatedInputTokens: 10, estimatedCostUsd: costUsd, providerStatus: 429 },
    ...(decisions === undefined ? {} : { evidenceLoop: { iterationCount: decisions, decisionCount: decisions, toolCallCount: decisions, evidenceBytes: 100 } })
  });
  /** What the recovery's own gate record says it spent, as `annotate.ts` writes it. */
  const ladderSpending = (costUsd: number) => vi.fn(async (refuted: { detail: AutomationStudioFlowRunDetail }) => ({ ...refuted.detail, metadata: { ...(refuted.detail.metadata ?? {}), llmGate: { invoked: true, costAccounting: { calls: 1, estimatedCostUsd: costUsd } } } }));

  it("hands a re-author retry only what the first build left: a fifth of the purse after four fifths", async () => {
    let calls = 0;
    const generate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw rateLimited(usd(CEILING * 0.8));
      return automationStudioReauthorProposed("adaptation.two", { requestId: "request.two", estimatedInputTokens: 10, estimatedCostUsd: usd(CEILING * 0.16) });
    });
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect((generate.mock.calls as unknown[][]).map((call) => call[2])).toEqual([CEILING, usd(CEILING * 0.2)]);
    expect(marker(result)).toMatchObject({ held: true, purse: { limitUsd: CEILING, spentUsd: usd(CEILING * 0.96), leftUsd: usd(CEILING * 0.04) } });
  });

  it("does not run the patch ladder once the re-authors have spent the purse, and names cost as why", async () => {
    const spent = [usd(CEILING * 0.6), usd(CEILING * 0.4)];
    const generate = vi.fn(async () => { throw rateLimited(spent.shift()!); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect((generate.mock.calls as unknown[][]).map((call) => call[2])).toEqual([CEILING, usd(CEILING * 0.4)]);
    // The ladder is a recovery that asks a model; it was not called at all.
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result)).toMatchObject({
      degraded: { to: "patch_ladder", afterCode: "flow_bootstrap.provider_rate_limited", bound: "cost" },
      purse: { limitUsd: CEILING, spentUsd: CEILING, leftUsd: 0, refusedParts: ["patch_ladder"], bound: "cost" }
    });
  });

  it("does not build again when the first build spent the purse, and records the retry it did not make", async () => {
    const generate = vi.fn(async () => { throw rateLimited(CEILING); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result).attempts).toHaveLength(2);
    expect(marker(result).attempts[1]).toMatchObject({ code: "llm_budget.run_cost_limit", retryable: false, providerInvocation: "not_attempted" });
    expect(marker(result).purse).toMatchObject({ spentUsd: CEILING, refusedParts: ["reauthor", "patch_ladder"], bound: "cost" });
  });

  it("caps the whole repair at a Flow's lower figure, re-author, retry and patch ladder together", async () => {
    const flowUsd = usd(CEILING * 0.4);
    const spent = [usd(CEILING * 0.28), usd(CEILING * 0.08)];
    const generate = vi.fn(async () => { throw rateLimited(spent.shift()!); });
    const annotate = ladderSpending(usd(CEILING * 0.04));
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, annotate: annotate as never, maxCostUsd: () => flowUsd }))(request);

    const handed = [...(generate.mock.calls as unknown[][]).map((call) => call[2]), ...(annotate.mock.calls as unknown[][]).map((call) => call[1])];
    expect(handed).toEqual([flowUsd, usd(CEILING * 0.12), usd(CEILING * 0.04)]);
    expect(marker(result)).toMatchObject({ degraded: { to: "patch_ladder" }, purse: { limitUsd: flowUsd, spentUsd: flowUsd, leftUsd: 0 } });
    expect(marker(result).degraded.bound).toBeUndefined();
  });

  // A part handed a sliver would still spend a whole call past the total: the
  // build's loop always allows its first decision, and the recovery's ledger
  // charges a call what it actually cost. So a later part starts only when what
  // is left covers one more call at what the repair's calls have cost so far.
  it("starts no later part whose remainder would not cover one more call at the repair's average", async () => {
    // Rate-limited on its third decision, having made two: a retry may pass.
    const generate = vi.fn(async () => { throw rateLimited(usd(CEILING * 0.8), 2); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    // A fifth of the purse is left, and the build's two decisions cost two fifths each.
    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result).attempts[0]).toMatchObject({ code: "flow_bootstrap.provider_rate_limited", retryable: true });
    expect(marker(result).purse).toMatchObject({ spentUsd: usd(CEILING * 0.8), leftUsd: usd(CEILING * 0.2), averagedCalls: 2, averagedUsd: usd(CEILING * 0.8), refusedParts: ["reauthor"], bound: "cost" });
    // The first build explored, so the ladder is not a later part at all here: its fix is the re-author's (run 38).
    expect(marker(result).ladderSkipped).toEqual({ reason: "structural_fix", afterCode: "llm_budget.run_cost_limit" });
  });

  // t261: a Flow's own explicit limit is the user's policy, not only a way to
  // narrow the default, so one set above the default is honoured -- up to the
  // server maximum, and never past a test-scoped (Lab) ceiling.
  it("is set by a Flow's own limit above the default, up to the server maximum", async () => {
    const generate = vi.fn(async () => automationStudioReauthorProposed("adaptation.one", {}));
    await automationStudioRefutedResultRepairPort(deps({ generate: generate as never, maxCostUsd: () => 1 }))(request);
    expect((generate.mock.calls as unknown[][])[0]![2]).toBe(automationStudioLlmRunCostCeilingUsd(1));
    const capped = vi.fn(async () => automationStudioReauthorProposed("adaptation.one", {}));
    await automationStudioRefutedResultRepairPort(deps({ generate: capped as never, maxCostUsd: () => 11 }))(request);
    expect((capped.mock.calls as unknown[][])[0]![2]).toBe(automationStudioLlmRunCostCeilingUsd(11));
    expect((capped.mock.calls as unknown[][])[0]![2]).toBeLessThanOrEqual(10);
  });

  it("opens where the run's earlier passes left it, so a re-run refuted again spends from the same total", async () => {
    const generate = vi.fn(async () => automationStudioReauthorProposed("adaptation.three", { requestId: "request.three", estimatedInputTokens: 10, estimatedCostUsd: usd(CEILING * 0.04) }));
    const earlier = { ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { routed: true, applied: true, purse: { limitUsd: CEILING, spentUsd: usd(CEILING * 0.72), leftUsd: usd(CEILING * 0.28) } } } } as AutomationStudioFlowRunDetail;
    const result = await automationStudioRefutedResultRepairPort(deps({ generate: generate as never }))({ ...request, detail: earlier });

    expect((generate.mock.calls as unknown[][])[0]![2]).toBe(usd(CEILING * 0.28));
    expect(marker(result).purse).toMatchObject({ spentUsd: usd(CEILING * 0.76), leftUsd: usd(CEILING * 0.24) });
  });

  it("gives a refutation the route does not take the patch ladder with what is left, and nothing once it is spent", async () => {
    const notWrongAnswer = { ...request, detail: { ...detail, metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code: "core.result.unconfirmed" } } } as unknown as AutomationStudioFlowRunDetail };
    const annotate = ladderSpending(usd(CEILING * 0.08));
    const first = await automationStudioRefutedResultRepairPort(deps({ annotate: annotate as never }))(notWrongAnswer);
    expect((annotate.mock.calls as unknown[][])[0]![1]).toBe(CEILING);
    expect(marker(first)).toMatchObject({ routed: false, purse: { spentUsd: usd(CEILING * 0.08) } });

    const spentDetail = { ...notWrongAnswer.detail, metadata: { ...(notWrongAnswer.detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { purse: { limitUsd: CEILING, spentUsd: CEILING } } } } as AutomationStudioFlowRunDetail;
    const spentLadder = ladderSpending(usd(CEILING * 0.08));
    const second = await automationStudioRefutedResultRepairPort(deps({ annotate: spentLadder as never }))({ ...notWrongAnswer, detail: spentDetail });
    expect(spentLadder).not.toHaveBeenCalled();
    expect(marker(second).purse).toMatchObject({ refusedParts: ["patch_ladder"], bound: "cost" });
  });
});

// A refutation of the result itself names no step (`recovery/refuted-result/attempt.ts`): the patch
// ladder repairs one failed step and was handed a healthy one instead (run-muqilf9s, run-muqiojz4).
describe("a refutation that names no step", () => {
  const unnamed = { ...request, failedTraceAttempt: { nodeId: AUTOMATION_STUDIO_REFUTED_RESULT_NODE_ID } as never };

  it("is not handed to the patch ladder when the route does not take it", async () => {
    const notWrongAnswer = { ...unnamed, detail: { ...detail, metadata: { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, attempts: 1, code: "core.result.unconfirmed" } } } as unknown as AutomationStudioFlowRunDetail };
    const port = deps({});
    const result = await automationStudioRefutedResultRepairPort(port)(notWrongAnswer);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result)).toMatchObject({ routed: false, ladderSkipped: { reason: "names_no_step" } });
    expect(result?.metadata?.ladder).toBeUndefined();
  });

  it("does not degrade to the patch ladder when the re-author built nothing", async () => {
    const generate = vi.fn(async () => { throw new AutomationStudioLlmRequestRefusedError("llm.request.evidence_denied_key", "refused"); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(unnamed);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result)).toMatchObject({ routed: true, code: "flow_bootstrap.request_refused_evidence_denied_key", ladderSkipped: { reason: "names_no_step", afterCode: "flow_bootstrap.request_refused_evidence_denied_key" } });
    expect(marker(result).degraded).toBeUndefined();
  });
});

// Run 38 (`run-muqilf9s-c3211328`, cause C5): the re-author explored for eight
// decisions with the judge's fix -- a read, a filter and a confirm for each row
// -- and ended `not_doable`. The patch ladder then spent a diagnosis and a
// runtime patch call to answer `no_repair` under `control_gone`, because none of
// its runtime patches can add a step. A refutation's fix is always a change to
// the Flow's steps, so once the re-author has tried it, the ladder is not run.
describe("a re-author that explored and built nothing", () => {
  const explored = (decisionCount: number) => new AutomationStudioFlowBootstrapGenerationError({
    code: "flow_bootstrap.provider_output_validation_failed", stage: "provider_output_validation", retryable: false, providerInvocation: "attempted", providerResponse: "received",
    accounting: { requestId: "request.reauthor", estimatedInputTokens: 10, estimatedCostUsd: 0.0176 },
    evidenceLoop: { iterationCount: decisionCount, decisionCount, toolCallCount: 2, evidenceBytes: 100 }
  });

  it("is not followed by the patch ladder, and the run says why", async () => {
    const generate = vi.fn(async () => { throw explored(8); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(port.annotate).not.toHaveBeenCalled();
    expect(result?.metadata?.ladder).toBeUndefined();
    expect(marker(result)).toMatchObject({ routed: true, code: "flow_bootstrap.provider_output_validation_failed", ladderSkipped: { reason: "structural_fix", afterCode: "flow_bootstrap.provider_output_validation_failed" } });
    expect(marker(result).degraded).toBeUndefined();
    expect(marker(result).purse.refusedParts).toBeUndefined();
  });

  it("still degrades to the patch ladder when the build ended before its first decision", async () => {
    const generate = vi.fn(async () => { throw explored(0); });
    const port = deps({ generate: generate as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(port.annotate).toHaveBeenCalledTimes(1);
    expect(marker(result)).toMatchObject({ degraded: { to: "patch_ladder", afterCode: "flow_bootstrap.provider_output_validation_failed" } });
    expect(marker(result).ladderSkipped).toBeUndefined();
  });

  it("counts only this repair's builds, not an earlier pass's", async () => {
    const earlierPass = { attempt: 1, routed: true, code: "flow_bootstrap.not_doable", evidenceLoop: { decisionCount: 8 } };
    const second = {
      ...request,
      current: automationStudioResultRepairHistoryEntry({ attempt: 2, outcome, summary, nodeId: "node.s6" }),
      detail: { ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { routed: true, attempts: [earlierPass] } } } as AutomationStudioFlowRunDetail
    };
    const port = deps({ generate: (async () => { throw explored(0); }) as never });
    const result = await automationStudioRefutedResultRepairPort(port)(second);

    expect(port.annotate).toHaveBeenCalledTimes(1);
    expect(marker(result).ladderSkipped).toBeUndefined();
  });
});

// Live run muqk713g (Stage 6): the build's ending was dropped on the way to the
// run, so nothing said why each of its rounds stopped or which no-route case
// ended it. The attempt now carries the ending's closed facts -- its kind, each
// round's stop, the no-route case and the ids and codes of what was not done --
// never its message or the person's words.
describe("a re-author that ended not doable", () => {
  const notDoable = () => flowBootstrapBuildEndingFailure({
    kind: "not_doable",
    message: "I could not build this Flow, and I found no way to: \"save the kettle\": nothing I tried did it.",
    notDone: [{ id: "a2", quote: "save the kettle", todo: "no_step_added" }],
    tried: {
      rounds: 2, decisions: 13, stepsInFlow: 2, tested: "replayed_clean",
      stops: [{ round: 0, stopped: "iterations" }, { round: 1, stopped: "repeat_without_progress" }],
      noRoute: { kind: "repeated_unchanged" }
    }
  }, { trace: [], accounting: { iterations: 13, toolCalls: 13, evidenceBytes: 100, inputTokens: 10, outputTokens: 10, totalTokens: 20, estimatedCostUsd: 0.01 } }, { requestId: "request.reauthor", estimatedInputTokens: 10, estimatedCostUsd: 0.01 });

  it("records each round's stop and the no-route case on the attempt, in closed words only", async () => {
    const port = deps({ generate: (async () => { throw notDoable(); }) as never });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    const attempt = marker(result).attempts[0];
    expect(attempt).toMatchObject({ code: "flow_bootstrap.not_doable" });
    expect(attempt.ending).toEqual({
      kind: "not_doable",
      notDone: [{ id: "a2", todo: "no_step_added" }],
      tried: {
        rounds: 2, decisions: 13, stepsInFlow: 2, tested: "replayed_clean",
        stops: [{ round: 0, stopped: "iterations" }, { round: 1, stopped: "repeat_without_progress" }],
        noRoute: { kind: "repeated_unchanged" }
      }
    });
    expect(JSON.stringify(marker(result))).not.toContain("kettle");
  });
});

// W17 (live run `run-muw5zv4m-52d83027`, Stage 6 cause 2): the check refuted a
// correct cart and the re-author spent 46 decisions trying to change step 9,
// because nothing let it conclude the Flow already did what was asked. A
// re-author that completes its seeded draft unchanged now ends saying so.
describe("a re-author that concludes the Flow needs no change", () => {
  const REASON = "Step 10 chose 12 Double Rolls and step 11 raised the quantity to 2: the cart line reads 12 Double Rolls, Qty 2.";
  const carried = (position: number): AutomationStudioFlowDraftStep => ({
    position, id: `f${position}`, iteration: 0, callId: `seed.${position}`, toolId: "core.run_node", actionId: "web.dom.click", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "kept", ranWith: { target: `t${position}` }
  });
  const seeded = Array.from({ length: 11 }, (_, index) => carried(index + 1));
  const fixed = seeded.map((step) => step.position === 9 ? { ...step, input: { target: "t-other" }, ranWith: { target: "t-other" } } : step);

  /**
   * The service's build, as far as this route reaches it: its completion check
   * asks the watch it was handed before anything is checked or tested, throws
   * what the watch answers, and the build's catch wraps that throw as it wraps
   * every other (`runtime/service.ts`).
   */
  function serviceBuild(completedWith: readonly AutomationStudioFlowDraftStep[]) {
    return vi.fn(async (_request: unknown, _brief: unknown, _costLeftUsd: number, _startPages: unknown, watch?: AutomationStudioReauthorEndingWatch) => {
      try {
        const ended = watch?.completed({ seed: seeded, steps: completedWith, result: { summary: REASON, nothingToChange: true } });
        if (ended) throw ended;
      } catch (error) {
        throw automationStudioFlowBootstrapGenerationCatch(error, "provider_output_validation", undefined, "flow_bootstrap.provider_output_validation_failed", 3);
      }
      return automationStudioReauthorProposed("adaptation.fixed", { estimatedCostUsd: 0.004 });
    });
  }

  it("ends with no second build, approves and applies nothing, runs no patch ladder, and records the outcome and reason", async () => {
    const generate = serviceBuild(seeded);
    const approve = vi.fn(async () => undefined);
    const port = deps({ generate: generate as never, approve });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(approve).not.toHaveBeenCalled();
    expect(port.annotate).not.toHaveBeenCalled();
    expect(marker(result)).toMatchObject({ routed: true, outcome: "nothing_to_change", reason: REASON, attempt: 1 });
    expect(marker(result).attempts).toEqual([expect.objectContaining({ attempt: 1, routed: true, outcome: "nothing_to_change", reason: REASON })]);
    for (const key of ["adaptationId", "held", "applied", "code", "degraded"]) expect(marker(result)[key]).toBeUndefined();
    // Nothing is held or applied, so nothing is run again from the start.
    expect(automationStudioRefutedResultRerunsFlow(result!)).toBe(false);
  });

  it("with a real fix, builds, approves and holds the edit exactly as before", async () => {
    const generate = serviceBuild(fixed);
    const approve = vi.fn(async () => undefined);
    const port = deps({ generate: generate as never, approve });
    const result = await automationStudioRefutedResultRepairPort(port)(request);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.fixed", actorId: "runtime.result_repair" });
    expect(marker(result)).toMatchObject({ routed: true, adaptationId: "adaptation.fixed", held: true });
    expect(marker(result).outcome).toBeUndefined();
    expect(automationStudioRefutedResultRerunsFlow(result!)).toBe(true);
  });
});
