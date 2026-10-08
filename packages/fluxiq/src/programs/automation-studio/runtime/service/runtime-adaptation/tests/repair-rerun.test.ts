import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation } from "../../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { recoveryBudgetFromRuntimeAdaptationContext } from "../context.ts";
import { PROJECT_ID, adaptationContext, flow, readFails, rerun } from "./repair-rerun-harness.ts";

// Live run `run-munv53gt-a0e6f545`, shrunk: the first pass pressed a one-time
// check and read the list; its answer was refuted and the Flow re-authored with
// the press optional. The re-run's session had already passed the check, so the
// press found nothing. It used to stop after three attempts at the press, and
// the store kept none of the re-run's first four attempts, whose ids repeated
// the first pass's.
//
// Since t174's F38 (2026-10-02) an optional press whose target the host found
// absent is skipped, not failed: one attempt, recorded succeeded with route
// `skipped` and `skipped.reason` `target_absent`, then the run takes the
// press's failed route into the Merge, with no retry and no recovery ladder.
// The re-run therefore has one check attempt where it used to have three.

describe("a repaired re-run of an optional press whose target is gone", () => {
  it("runs under the default recovery budget a Flow is created with", async () => {
    const context = await adaptationContext();

    // Three retries, the runtime's own default (t355).
    expect(recoveryBudgetFromRuntimeAdaptationContext(context)).toMatchObject({ maxRetriesPerAction: 3, maxRecoveryAttemptsPerSubflow: 2, maxReroutesPerRun: 2 });
  });

  it("follows the press's failed route through the Merge and reaches the step after it", async () => {
    const { result } = await rerun();
    const trace = result?.session?.trace;

    expect(trace?.status).toBe("succeeded");
    const rerunAttempts = trace?.attempts.slice(4) ?? [];
    // An absent sometimes-present step is skipped and the run routes on (F38),
    // so the press is tried once and never enters the recovery ladder.
    expect(rerunAttempts.map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    expect(rerunAttempts[1]).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent", code: "web.target.not_found" } });
    expect(rerunAttempts[1]?.recoveryDecision).toBeUndefined();
  });

  it("numbers the re-run's attempts after the first pass's, so the run keeps every one of them", async () => {
    const { session, result, saved } = await rerun();
    const firstPassIds = session.trace?.attempts.map((attempt) => attempt.attemptId) ?? [];
    const keptIds = result?.session?.trace?.attempts.map((attempt) => attempt.attemptId) ?? [];

    expect(firstPassIds).toEqual(["search.attempt.1", "check.attempt.2", "join.attempt.3", "read.attempt.4"]);
    // One check attempt, since the absent optional press is skipped (F38).
    expect(keptIds.slice(4)).toEqual(["search.attempt.5", "check.attempt.6", "join.attempt.7", "read.attempt.8"]);
    expect(new Set(keptIds).size).toBe(keptIds.length);
    // The detail the store is handed carries every attempt under its own id,
    // which is what the store's write-once-per-id keeps.
    const detailIds = saved.at(-1)?.actionAttempts?.map((attempt) => attempt.attemptId) ?? [];
    expect(detailIds).toEqual(keptIds);
    // The skipped press reaches the stored detail as skipped, never as failed.
    expect(saved.at(-1)?.actionAttempts?.find((attempt) => attempt.attemptId === "check.attempt.6")).toMatchObject({ status: "succeeded", route: "skipped", skipped: { reason: "target_absent" } });
  });
});

// Live run `run-munw7ffn-fe1cecd2`: the re-run of a re-authored Flow failed,
// and its detail carried no recovery marker, because the first pass had
// succeeded and no recovery ever ran. The Lab read the failure as a recovery
// still to come and waited 306 s for a record Core never writes.
describe("the recovery marker on a finished repair re-run", () => {
  it("says a failed re-run of a re-authored Flow has ended its recovery", async () => {
    const { result, saved } = await rerun({ dispatcher: readFails });
    const metadata = saved.at(-1)?.metadata as Record<string, any> | undefined;

    expect(result?.session?.status).toBe("failed");
    expect(metadata?.repairedRerun).toMatchObject({ attempted: true, status: "failed" });
    expect(metadata?.recoveryState).toMatchObject({ state: "ended" });
    expect(metadata?.recoveryState.endedAt).toBeGreaterThanOrEqual(metadata?.recoveryState.startedAt);
  });

  it("says a succeeded re-run has ended too, so no reader waits on it", async () => {
    const { saved } = await rerun();

    expect((saved.at(-1)?.metadata as Record<string, any> | undefined)?.recoveryState).toMatchObject({ state: "ended" });
  });

  it("keeps the marker of the recovery that ran before the re-run", async () => {
    const ladder = { state: "ended", startedAt: 5, endedAt: 9 };
    const { saved } = await rerun({ dispatcher: readFails, detailMetadata: { recoveryState: ladder } });

    expect((saved.at(-1)?.metadata as Record<string, any> | undefined)?.recoveryState).toEqual(ladder);
  });

  it("replaces a first pass's running marker, since the re-run has finished", async () => {
    const { saved } = await rerun({ dispatcher: readFails, detailMetadata: { recoveryState: { state: "running", startedAt: 5 } } });

    expect((saved.at(-1)?.metadata as Record<string, any> | undefined)?.recoveryState).toMatchObject({ state: "ended" });
  });
});

// t249: a runtime patch reaches the stored Flow only after a whole run that ran
// it was judged to answer. The resume after a patch therefore runs the
// unapplied candidate -- the stored Flow with the run's pending patches written
// onto it in memory -- and never writes the stored Flow. A re-run from the
// start follows a re-authored Flow and settles a still-pending patch first,
// unapplied, with the reason its own run gave.
describe("a re-run and a runtime patch still waiting for its judged run", () => {
  const ADAPTATION_ID = "adaptation.read-target";
  const pendingDecision = { autoApply: true, applyAt: "judged_whole_run", applied: false, reason: "trial succeeded" };
  const receipt = { kind: "temporary_target_override", adaptationId: ADAPTATION_ID, retryOriginalAction: true, resumable: true, resumeFrom: { nodeId: "search", route: "success" }, approvalDecision: pendingDecision };
  const adaptation = (targetId = "read"): AutomationStudioFlowAdaptation => ({
    schemaVersion: "0.1",
    adaptationId: ADAPTATION_ID,
    flowId: flow.flowId,
    projectId: PROJECT_ID,
    sourceRunId: "run.rerun",
    trigger: "Runtime patch temporary_target_override restored expected state.",
    patch: [{ kind: "edit_action_target", targetId, summary: "The results moved.", after: { selector: "#results-v2" } }],
    status: "validated",
    author: "runtime",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 1,
    metadata: { approvalDecision: pendingDecision }
  });
  /** The read lands only on the repaired target. */
  const readNeedsRepair: NonNullable<AutomationStudioGraphExecutionOptions["effectDispatcher"]> = (effect) => {
    const payload = JSON.stringify(effect.payload ?? null);
    if (payload.includes("results") && !payload.includes("results-v2")) return { status: "failed", route: "failed", message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution" } };
    return { status: "success", route: "success", outputs: { ok: true } };
  };

  it("resumes on the candidate with the patch written in, and leaves the stored Flow as it was", async () => {
    const { result, saved, savedAdaptations, applied, stored } = await rerun({ from: "resume", dispatcher: readNeedsRepair, adaptations: [adaptation()], detailMetadata: { runtimePatchAttempts: [receipt] } });

    expect(result?.session?.status).toBe("succeeded");
    // The resume began at the trial's resume point and pressed the repaired target.
    expect(result?.session?.trace?.attempts.slice(4).map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    expect(result?.session?.trace?.attempts.at(-1)).toMatchObject({ nodeId: "read", status: "succeeded" });
    expect(result?.flow?.nodes.find((node) => node.id === "read")?.parameterValues).toMatchObject({ parameters: { elementId: "results", target: { selector: "#results-v2" } } });
    // Nothing was written: not the Flow, not the adaptation.
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ outputId: "activate-element", parameters: { elementId: "results" } });
    expect(savedAdaptations).toEqual([]);
    expect(applied).toEqual([]);
    // The run says which pending patches the pass ran, for the judged settle.
    expect(saved.at(-1)?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded", candidateAdaptationIds: [ADAPTATION_ID] });
  });

  it("declines the resume when a pending patch cannot be written onto the Flow, rather than running a Flow without it", async () => {
    const { result, written } = await rerun({ from: "resume", dispatcher: readNeedsRepair, adaptations: [adaptation("gone")], detailMetadata: { runtimePatchAttempts: [receipt] } });

    expect(result).toEqual({ declinedCode: "repair_rerun.candidate_unwritable" });
    expect(written).toEqual([]);
  });

  // A re-authored Flow is run as stored: a pending patch was written for the graph before.
  const reauthoredMarker = { resultReauthor: { routed: true, applied: true, adaptationId: "adaptation.bootstrap.1", attempt: 1, attempts: [] } };

  it("settles a pending patch unapplied before a re-authored Flow's re-run from the start, with its run's reason", async () => {
    const { result, saved, savedAdaptations, applied } = await rerun({
      adaptations: [adaptation()],
      detailMetadata: { ...reauthoredMarker, runtimePatchAttempts: [receipt], adaptiveRetry: { attempted: true, status: "succeeded", candidateAdaptationIds: [ADAPTATION_ID] } },
      sessionMetadata: { resultVerification: { status: "refuted", performed: true, verdict: "does_not_answer" } }
    });

    expect(result?.session?.status).toBe("succeeded");
    expect(applied).toEqual([]);
    expect(savedAdaptations).toHaveLength(1);
    expect(savedAdaptations[0]?.metadata?.approvalDecision).toMatchObject({ autoApply: true, applied: false, notAppliedReason: "refuted", judgedRunId: "run.rerun" });
    // The re-run ran the re-authored Flow as stored, without the patch.
    expect(result?.flow?.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ outputId: "activate-element", parameters: { elementId: "results" } });
    const kept = saved.at(-1)?.metadata?.runtimePatchAttempts as Array<Record<string, any>> | undefined;
    expect(kept?.[0]?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "refuted" });
  });

  it("settles a patch no pass ran as never re-run when the Flow was re-authored", async () => {
    const { savedAdaptations } = await rerun({ adaptations: [adaptation()], detailMetadata: { ...reauthoredMarker, runtimePatchAttempts: [receipt] } });

    expect(savedAdaptations[0]?.metadata?.approvalDecision).toMatchObject({ applied: false, notAppliedReason: "not_rerun" });
  });

  // t249 follow-up: the patch ladder after a refuted result writes a patch with
  // no failed step to resume from. The whole Flow is run again from its start,
  // on the unapplied candidate, so the patch can be judged -- and kept.
  it("runs a patch no pass has run yet as the candidate of a whole-Flow re-run from the start", async () => {
    const { result, saved, savedAdaptations, applied, stored } = await rerun({ reauthored: false, dispatcher: readNeedsRepair, adaptations: [adaptation()], detailMetadata: { runtimePatchAttempts: [receipt] } });

    expect(result?.session?.status).toBe("succeeded");
    expect(result?.session?.trace?.attempts.slice(4).map((attempt) => attempt.nodeId)).toEqual(["search", "check", "join", "read"]);
    expect(result?.flow?.nodes.find((node) => node.id === "read")?.parameterValues).toMatchObject({ parameters: { target: { selector: "#results-v2" } } });
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues).toEqual({ outputId: "activate-element", parameters: { elementId: "results" } });
    expect(savedAdaptations).toEqual([]);
    expect(applied).toEqual([]);
    expect(saved.at(-1)?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded", candidateAdaptationIds: [ADAPTATION_ID] });
  });

  it("settles the earlier pass's patch on that pass's verdict before running the new one", async () => {
    const earlier = { ...adaptation(), adaptationId: "adaptation.earlier" };
    const { result, savedAdaptations } = await rerun({
      reauthored: false,
      dispatcher: readNeedsRepair,
      adaptations: [earlier, adaptation()],
      detailMetadata: { runtimePatchAttempts: [{ ...receipt, adaptationId: "adaptation.earlier" }, receipt], adaptiveRetry: { attempted: true, status: "succeeded", candidateAdaptationIds: ["adaptation.earlier"] } },
      sessionMetadata: { resultVerification: { status: "refuted", performed: true, verdict: "does_not_answer" } }
    });

    expect(savedAdaptations.map((saved) => [saved.adaptationId, (saved.metadata?.approvalDecision as Record<string, unknown> | undefined)?.notAppliedReason])).toEqual([["adaptation.earlier", "refuted"]]);
    expect(result?.session?.status).toBe("succeeded");
  });

  it("declines a re-run from the start that would change nothing", async () => {
    const { result, written } = await rerun({ reauthored: false, adaptations: [], detailMetadata: {} });

    expect(result).toEqual({ declinedCode: "repair_rerun.nothing_to_rerun" });
    expect(written).toEqual([]);
  });

  // t249 follow-up: a trial that ran the Flow to its end began at the Flow's
  // start and finished on the candidate. It is adopted as the resumed pass,
  // and nothing runs again.
  it("adopts a trial that ran the Flow to its end as the resumed pass, running nothing again", async () => {
    const trialAttempt = { attemptId: "read.attempt.5", nodeId: "read", definitionId: "builtin.policy.action", startedAt: 3, finishedAt: 4, status: "succeeded", route: "success", inputs: {}, outputs: { ok: true }, effects: [] };
    const completedTrace = { status: "succeeded", startedAt: 3, finishedAt: 4, attempts: [trialAttempt], values: { ok: true }, effects: [] };
    const dispatched: string[] = [];
    const { result, saved, written } = await rerun({
      from: "resume",
      dispatcher: (effect) => { dispatched.push(JSON.stringify(effect.payload ?? null)); return { status: "success", route: "success", outputs: { ok: true } }; },
      adaptations: [adaptation()],
      detailMetadata: { runtimePatchAttempts: [{ ...receipt, resumeFrom: { completed: true }, completedTrace }] }
    });

    expect(dispatched).toEqual([]);
    expect(result?.session?.status).toBe("succeeded");
    expect(result?.session?.trace?.attempts.map((attempt) => attempt.attemptId)).toEqual(["search.attempt.1", "check.attempt.2", "join.attempt.3", "read.attempt.4", "read.attempt.5"]);
    expect(written.at(-1)?.status).toBe("succeeded");
    const kept = saved.at(-1)?.metadata as Record<string, any> | undefined;
    expect(kept?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded", trialCompleted: true, candidateAdaptationIds: [ADAPTATION_ID] });
    // The trial's pass now lives in the run's own trace, not on its receipt.
    expect(kept?.runtimePatchAttempts?.[0]).not.toHaveProperty("completedTrace");
  });

  it("still declines a completed trial whose receipt carries no pass to adopt", async () => {
    const { result, written } = await rerun({ from: "resume", adaptations: [adaptation()], detailMetadata: { runtimePatchAttempts: [{ ...receipt, resumeFrom: { completed: true } }] } });

    expect(result).toEqual({ declinedCode: "resume_point_completed" });
    expect(written).toEqual([]);
  });
});
