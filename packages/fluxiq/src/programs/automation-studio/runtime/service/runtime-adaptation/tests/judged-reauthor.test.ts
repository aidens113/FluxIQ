// t267: a held re-author is applied only once a whole run that ran it is
// judged to answer, and otherwise rejected, with the reason on the run's
// re-author marker: a validated edit left waiting would refuse every later
// build of the Flow. An earlier held attempt a later one replaced is never
// applied.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import { automationStudioRefutedResultReauthored } from "../../../recovery/refuted-result/index.ts";
import { AutomationStudioProjectStoreUnavailableError } from "../../../../storage/index.ts";
import { settleAutomationStudioRunJudgedReauthor, type AutomationStudioJudgedReauthorPorts } from "../index.ts";

const ROUTED = { route: true as const, projectId: "project.one", flowId: "flow.one" };
const ANSWERS = { resultVerification: { performed: true, verdict: "answers" } };
const REFUTED = { resultVerification: { performed: true, verdict: "does_not_answer" } };

function baseDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: { schemaVersion: "0.1", runId: "run.one", flowId: "flow.one", projectId: "project.one", status: "failed", updatedAt: 3, routeDecisionCount: 0, subflowEntryCount: 0, actionAttemptCount: 0, interventionCount: 0, adaptationCount: 0 },
    routeDecisions: [], subflows: [], actionAttempts: [], interventions: [], adaptationIds: [], changeProposalIds: [], metadata: {}
  };
}

/** A run whose re-author built and held each of `ids`, oldest first. */
function heldDetail(...ids: string[]): AutomationStudioFlowRunDetail {
  return ids.reduce((detail, adaptationId, index) => automationStudioRefutedResultReauthored({ detail, decision: ROUTED, adaptationId, held: true, attempt: index + 1 }), baseDetail());
}

function session(status: AutomationStudioRuntimeSession["status"], metadata: Record<string, unknown>, traceStatus?: "succeeded" | "failed"): AutomationStudioRuntimeSession {
  return { schemaVersion: "0.1", runId: "run.one", projectId: "project.one", targetKind: "flow", targetId: "flow.one", flowId: "flow.one", status, queuedAt: 1, metadata, ...(traceStatus ? { trace: { status: traceStatus, startedAt: 1, attempts: [], effects: [] } } : {}) } as unknown as AutomationStudioRuntimeSession;
}

function ports(detail: AutomationStudioFlowRunDetail | null, overrides: Partial<AutomationStudioJudgedReauthorPorts> = {}) {
  const saved: AutomationStudioFlowRunDetail[] = [];
  const applied: Array<Record<string, string>> = [];
  const rejected: Array<Record<string, string>> = [];
  const read = vi.fn(async () => detail);
  return {
    saved, applied, rejected, read,
    ports: {
      getFlowRunDetail: read,
      saveFlowRunDetail: async (next: AutomationStudioFlowRunDetail) => { saved.push(next); },
      applyFlowBootstrapAdaptation: async (input: Record<string, string>) => { applied.push(input); },
      rejectFlowBootstrapAdaptation: async (input: Record<string, string>) => { rejected.push(input); },
      writeRuntimeSession: async () => undefined,
      ...overrides
    } as AutomationStudioJudgedReauthorPorts
  };
}

function marker(detail: AutomationStudioFlowRunDetail | undefined): Record<string, any> {
  return (detail?.metadata?.resultReauthor ?? {}) as Record<string, any>;
}

describe("settling a held re-author at the run's judged end", () => {
  it("applies it when the pass that ran it was judged to answer", async () => {
    const store = ports(heldDetail("adaptation.held"));
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.held" }) });

    expect(store.applied).toEqual([{ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.held", actorId: "runtime.result_repair" }]);
    expect(store.rejected).toEqual([]);
    expect(marker(store.saved.at(-1))).toMatchObject({ held: true, applied: true, judgedRunId: "run.one", attempts: [{ adaptationId: "adaptation.held", applied: true, judgedRunId: "run.one" }] });
    expect(marker(store.saved.at(-1)).notAppliedReason).toBeUndefined();
  });

  it.each([
    ["refuted", session("failed", { ...REFUTED, heldReauthorAdaptationId: "adaptation.held" }, "succeeded")],
    ["run_failed", session("failed", { heldReauthorAdaptationId: "adaptation.held" })],
    // The re-run failed, and its session still carries the first pass's refutation: the pass's own trace decides.
    ["run_failed", session("failed", { ...REFUTED, heldReauthorAdaptationId: "adaptation.held" }, "failed")],
    ["not_judged", session("succeeded", { heldReauthorAdaptationId: "adaptation.held" })],
    ["not_rerun", session("failed", { ...REFUTED })],
    ["not_rerun", session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.other" })],
    ["run_cancelled", session("cancelled", { heldReauthorAdaptationId: "adaptation.held" })]
  ] as const)("rejects it, as %s, when the run did not answer by running it", async (reason, ended) => {
    const store = ports(heldDetail("adaptation.held"));
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: ended });

    expect(store.applied).toEqual([]);
    // Left validated, it would refuse every later build of the Flow (`flow_bootstrap.pending_adaptation_exists`).
    expect(store.rejected).toEqual([{ projectId: "project.one", flowId: "flow.one", adaptationId: "adaptation.held", actorId: "runtime.result_repair" }]);
    expect(marker(store.saved.at(-1))).toMatchObject({ held: true, notAppliedReason: reason, attempts: [{ notAppliedReason: reason }] });
    expect(marker(store.saved.at(-1)).applied).toBeUndefined();
  });

  it("never applies an earlier held attempt a later one replaced", async () => {
    const store = ports(heldDetail("adaptation.first", "adaptation.second"));
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.second" }) });

    expect(store.applied.map((input) => input.adaptationId)).toEqual(["adaptation.second"]);
    expect(store.rejected.map((input) => input.adaptationId)).toEqual(["adaptation.first"]);
    const attempts = marker(store.saved.at(-1)).attempts as Array<Record<string, unknown>>;
    expect(attempts.map((attempt) => [attempt.adaptationId, attempt.applied, attempt.notAppliedReason])).toEqual([["adaptation.first", undefined, "superseded"], ["adaptation.second", true, undefined]]);
  });

  it.each([
    ["apply_failed", new Error("FLOW_BOOTSTRAP_STALE")],
    ["store_unavailable", new AutomationStudioProjectStoreUnavailableError("pool is closing")]
  ] as const)("records %s, in codes only, when the apply itself is refused", async (reason, error) => {
    const store = ports(heldDetail("adaptation.held"), { applyFlowBootstrapAdaptation: async () => { throw error; } });
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.held" }) });

    expect(marker(store.saved.at(-1))).toMatchObject({ notAppliedReason: reason });
    expect(store.rejected.map((input) => input.adaptationId)).toEqual(["adaptation.held"]);
    expect(JSON.stringify(store.saved.at(-1))).not.toContain(error.message);
  });

  // A refuted run whose re-author's re-run never happened (declined, or the
  // store could not hand over the Flow) answered `succeeded` and ran no held
  // edit, so its record was never read, and its held edit stayed validated.
  it("reads the record of a refuted run that ran no held edit, and rejects the edit as not re-run", async () => {
    const store = ports(heldDetail("adaptation.held"));
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("succeeded", { ...REFUTED }) });

    expect(store.read).toHaveBeenCalledTimes(1);
    expect(store.rejected.map((input) => input.adaptationId)).toEqual(["adaptation.held"]);
    expect(marker(store.saved.at(-1))).toMatchObject({ notAppliedReason: "not_rerun" });
  });

  it("rejects every held edit of a run that threw, as run_errored, whatever its session says", async () => {
    const store = ports(heldDetail("adaptation.first", "adaptation.second"));
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.second" }), reason: "run_errored" });

    expect(store.applied).toEqual([]);
    expect(store.rejected.map((input) => input.adaptationId)).toEqual(["adaptation.first", "adaptation.second"]);
    expect((marker(store.saved.at(-1)).attempts as Array<Record<string, unknown>>).map((attempt) => attempt.notAppliedReason)).toEqual(["run_errored", "run_errored"]);
  });

  it("says, in a code, when the rejection itself is refused", async () => {
    const store = ports(heldDetail("adaptation.held"), { rejectFlowBootstrapAdaptation: async () => { throw new Error("Only a proposed or validated Flow Bootstrap adaptation can be rejected."); } });
    await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("failed", { ...REFUTED, heldReauthorAdaptationId: "adaptation.held" }, "succeeded") });

    expect(marker(store.saved.at(-1))).toMatchObject({ notAppliedReason: "refuted", rejectRefused: "refused" });
    expect(JSON.stringify(store.saved.at(-1))).not.toContain("Only a proposed");
  });

  it("does not read the record of a run that answered without running a held edit", async () => {
    const store = ports(heldDetail("adaptation.held"));
    const ended = session("succeeded", { ...ANSWERS });
    await expect(settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: ended })).resolves.toBe(ended);

    expect(store.read).not.toHaveBeenCalled();
    expect(store.saved).toEqual([]);
  });

  it("does nothing without the Flow the re-author extended, or with nothing held", async () => {
    const noFlow = ports(heldDetail("adaptation.held"));
    await settleAutomationStudioRunJudgedReauthor({ ports: noFlow.ports, projectId: "project.one", flowId: undefined, session: session("failed", {}) });
    expect(noFlow.read).not.toHaveBeenCalled();

    const nothingHeld = ports(baseDetail());
    await settleAutomationStudioRunJudgedReauthor({ ports: nothingHeld.ports, projectId: "project.one", flowId: "flow.one", session: session("failed", {}) });
    expect(nothingHeld.saved).toEqual([]);
    expect(nothingHeld.applied).toEqual([]);
  });

  it("leaves every held edit unapplied when the store cannot hand over the record", async () => {
    const store = ports(null, { getFlowRunDetail: async () => { throw new AutomationStudioProjectStoreUnavailableError("pool is closing"); } });
    const ended = session("succeeded", { ...ANSWERS, heldReauthorAdaptationId: "adaptation.held" });
    await expect(settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: ended })).resolves.toBe(ended);

    expect(store.applied).toEqual([]);
  });

  it("notes on the session when the settled record could not be saved", async () => {
    const written: AutomationStudioRuntimeSession[] = [];
    const store = ports(heldDetail("adaptation.held"), {
      saveFlowRunDetail: async () => { throw new AutomationStudioProjectStoreUnavailableError("pool is closing"); },
      writeRuntimeSession: async (_projectId, noted) => { written.push(noted); }
    });
    const result = await settleAutomationStudioRunJudgedReauthor({ ports: store.ports, projectId: "project.one", flowId: "flow.one", session: session("failed", { ...REFUTED, heldReauthorAdaptationId: "adaptation.held" }) });

    expect(result.metadata?.judgedReauthorSettlement).toMatchObject({ status: "store_unavailable", step: "save_record" });
    expect(written).toEqual([result]);
  });
});
