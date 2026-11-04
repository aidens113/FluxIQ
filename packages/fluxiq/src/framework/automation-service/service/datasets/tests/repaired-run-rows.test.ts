// @fluxiq-test-group real-sql
// What a repaired run's dataset holds, through the real service and the real
// project store, with a scripted provider.
//
// Live run `run-mw0jw263-0251c104` was refuted with 3 rows, its patch ladder
// tried a fix that read all 10, and the run ended holding 13: the 3, then the 10,
// neither deduped nor sorted. The ladder's trial wrote under the run's id through
// the run's own record hook, which cleared the processed answer, and nothing
// processed the dataset after it; and the fix itself, which had worked, was
// thrown away because a trial of inserted steps could never earn a judged re-run.
//
// Every record output here appends, as a built Flow's does. The re-author chain
// beside the service (`tests/refuted-result/tests/repair-replay-chain.test.ts`)
// declares `replace`, which is why it never saw the rows of the pass it repaired.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioRefutedResultReauthorDecision } from "../../../../../runtime/adaptation/recovery/refuted-result/index.ts";
import { automationStudioActivityRunEnding } from "../../../../../runtime/automation-activity/wording/index.ts";
import { automationStudioResultComputedFacts } from "../../../../../runtime/result-verification/computed-facts/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import { ALL_TEN, carryTheOrderThenNarrow, FIRST_THREE, narrowTheRead, startRepairedRun, type RepairedRunScript } from "./repaired-run-harness.ts";

// The saved run was refuted by Core's own record, which the re-author route does
// not take, so the ladder followed. The fact is stubbed in, once: its own modules
// are tested beside them, and any later pass is the judge's.
vi.mock("../../../../../runtime/result-verification/computed-facts/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../runtime/result-verification/computed-facts/index.ts")>();
  return { ...actual, automationStudioResultComputedFacts: vi.fn(() => []) };
});
const computedFacts = vi.mocked(automationStudioResultComputedFacts);
/** The first pass's answer fails on Core's record, as the saved run's did. */
const refutedByCore = () => computedFacts.mockReturnValueOnce([{ kind: "count", status: "fails", said: "Core counted 3 stored rows where the request owes more.", defects: [{ kind: "asked_missing", row: "listing-0", requestWords: "every listing" }] }]);

// The patch ladder is what a refutation the re-author route does not take goes to, so a test of the ladder has
// the route say no, once. Which refutations it takes has its own test, in `refuted-result/tests/reauthor.test.ts`.
vi.mock("../../../../../runtime/adaptation/recovery/refuted-result/reauthor.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../runtime/adaptation/recovery/refuted-result/reauthor.ts")>();
  return { ...actual, automationStudioRefutedResultReauthorDecision: vi.fn(actual.automationStudioRefutedResultReauthorDecision) };
});
/** The first pass's answer fails on Core's record and its repair goes to the ladder, as the saved run's did. */
const refutedToTheLadder = () => {
  refutedByCore();
  vi.mocked(automationStudioRefutedResultReauthorDecision).mockReturnValueOnce({ route: false, refusal: "not_a_wrong_answer" });
};

let tempRoot: string;
const services = new Set<AutomationStudioService>();
const start = (script: RepairedRunScript) => startRepairedRun(script, tempRoot, services);

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t848-"));
  computedFacts.mockReset();
  computedFacts.mockReturnValue([]);
});
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("a patch that passed its trial", () => {
  it("reaches a judged re-run whose rows are the answer, and is kept once that run answers", { timeout: 180_000 }, async () => {
    refutedToTheLadder();
    const { run, detail, rows, summary, presses, service, projectId, flowId, graphFlowId, taskKinds, replay } = await start({});

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_action_sequence", preflightOk: true, traceStatus: "succeeded", verification: { awaitsJudgedRun: true } }]);
    expect(detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded" });
    // First pass, the trial, then the whole Flow again: the re-run ran the fix, or it would have read the three again.
    expect(presses).toEqual(["open", "narrow", "open", "narrow"]);
    expect(run.status).toBe("succeeded");
    expect(run.trace?.attempts.filter((attempt) => attempt.nodeId === "start")).toHaveLength(2);
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { collected: 10, duplicates: 0, kept: 10 } });

    // Judged to answer, so it is kept: the stored Flow reads the right list, and replays it with no model.
    const receipt = (detail?.metadata?.runtimePatchAttempts as Array<{ adaptationId?: string }>)[0]!;
    await expect(service.getFlowAdaptation(projectId, flowId, receipt.adaptationId!)).resolves.toMatchObject({ status: "applied", patch: [{ kind: "insert_steps", targetId: "read" }] });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.filter((node) => node.parameterValues?.control === "narrow")).toHaveLength(1);
    const calls = taskKinds.length;
    await expect(replay()).resolves.toEqual({ status: "succeeded", rows: ALL_TEN });
    expect(taskKinds).toHaveLength(calls);
  });

  it("is not kept when the judged re-run does not answer: passing a trial proves nothing on its own", { timeout: 180_000 }, async () => {
    refutedToTheLadder();
    const { run, detail, rows, service, projectId, graphFlowId } = await start({ reads: ({ narrowed }) => (narrowed ? [{ name: "not-a-listing" }, ...ALL_TEN] : FIRST_THREE) });

    expect(detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded" });
    expect(run.status).toBe("failed");
    expect(run.metadata?.resultVerification).toMatchObject({ verdict: "does_not_answer" });
    expect(rows).toEqual([{ name: "not-a-listing" }, ...ALL_TEN]);
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.filter((node) => node.parameterValues?.control === "narrow")).toHaveLength(0);
  });

  it("gets no re-run where a lasting act may have landed, and the act is not repeated", { timeout: 180_000 }, async () => {
    refutedByCore();
    const { run, detail, rows, summary, presses, taskKinds, service, projectId, graphFlowId } = await start({ lastingStep: true });

    // Nor a patch: it could only be kept by the re-run that would be declined.
    expect(taskKinds).not.toContain("runtime_patch");
    expect(presses.filter((control) => control === "order")).toHaveLength(1);
    expect(detail?.metadata?.repairedRerun).toBeUndefined();
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: "repair_rerun.lasting_act_may_have_landed" });
    expect(run.status).toBe("failed");
    expect(rows).toEqual(FIRST_THREE);
    expect(summary).toMatchObject({ recordCount: 3, processing: { collected: 3, kept: 3 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.filter((node) => node.parameterValues?.control === "narrow")).toHaveLength(0);
  });
});

describe("a re-authored Flow", () => {
  it("is re-routed from a no Core's own record reached, as from a judge's, and its re-run's rows are the answer", { timeout: 180_000 }, async () => {
    refutedByCore();
    const { run, detail, rows, summary } = await start({ noOpen: true, reauthor: narrowTheRead });

    expect(detail?.metadata?.resultVerification).toMatchObject({ verdict: "answers" });
    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
    expect(detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded" });
    expect(run.status).toBe("succeeded");
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ processing: { collected: 10, kept: 10 } });
  });

  // No edit is built at all now (`runtime-adaptation/tests/repair-followups.test.ts`). The edit a build made anyway is declined at its re-run, as `runtime-adaptation/tests/repair-rerun.test.ts` tests.
  it("gets no re-run where a lasting act may have landed: the act is not repeated, and the run says so", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary, presses, service, projectId, graphFlowId } = await start({ noOpen: true, lastingStep: "marked", reauthor: carryTheOrderThenNarrow });

    expect(presses.filter((control) => control === "order")).toHaveLength(1);
    expect(detail?.metadata?.repairedRerun).toBeUndefined();
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: "repair_rerun.lasting_act_may_have_landed" });
    expect(detail?.metadata?.resultRepair).toMatchObject({ phase: "settled", outcome: "not_rerun" });
    // Honestly reported: failed, on the answer that was judged, and saying why the fix did not run.
    expect(automationStudioActivityRunEnding(detail?.metadata)).toBe("it saved 3 rows, but the check found they don't answer what you asked, and the fix wasn't run: that would repeat what this run already did.");
    expect(run.status).toBe("failed");
    expect(run.metadata?.resultVerification).toMatchObject({ verdict: "does_not_answer" });
    expect(rows).toEqual(FIRST_THREE);
    expect(summary).toMatchObject({ recordCount: 3, processing: { collected: 3, kept: 3 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.narrowed).toBeUndefined();
  });
});

// A refuted run's failure is never target-repairable, so a target override only
// reaches a run through a step that failed. That run resumes; it does not start again.
describe("a ladder's target override", () => {
  it("is held for the judged run its failed step resumes into, repeats no earlier act, and is kept once that run answers", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary, presses, service, projectId, graphFlowId } = await start({ patchesTarget: true, lastingStep: true, overrideFailsOn: "open", reads: () => ALL_TEN });

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_target_override", preflightOk: true, verification: { awaitsJudgedRun: true } }]);
    expect(detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded" });
    expect(presses.filter((control) => control === "order")).toHaveLength(1);
    expect(run.status).toBe("succeeded");
    expect(run.metadata?.resultVerification).toMatchObject({ verdict: "answers" });
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { kept: 10 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "open")?.parameterValues?.target).toMatchObject({ handles: { control: "narrowed-list" } });
  });

  it("is refused on a refuted run, so it gets no re-run there", { timeout: 180_000 }, async () => {
    refutedToTheLadder();
    const { run, detail, rows } = await start({ patchesTarget: true });

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_target_override", traceStatus: "not-run", targetOverrideRefusal: { status: "absent", reason: "failure_not_target_repairable" } }]);
    expect(detail?.metadata?.repairedRerun).toBeUndefined();
    expect(run.status).toBe("failed");
    expect(rows).toEqual(FIRST_THREE);
  });
});

describe("a patch that failed its trial", () => {
  it("stays discarded: no re-run, and the answer that was judged stands, processed", { timeout: 180_000 }, async () => {
    refutedToTheLadder();
    const { run, detail, rows, summary, presses, reads, service, projectId, graphFlowId } = await start({ patchControl: "broken" });

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_action_sequence", verification: { status: "contradicted" } }]);
    expect(detail?.metadata?.repairedRerun).toBeUndefined();
    expect(run.status).toBe("failed");
    expect(presses).toEqual(["open"]);
    expect(reads).toHaveLength(1);
    expect(rows).toEqual(FIRST_THREE);
    expect(summary).toMatchObject({ recordCount: 3, processing: { collected: 3, duplicates: 0, kept: 3 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.filter((node) => node.parameterValues?.control === "broken")).toHaveLength(0);
  });
});

// A step that failed for good and whose fix cannot be asked for in place (an item
// found gone) reaches the detached ladder, whose trial the run may carry on from.
describe("a failed step's trial", () => {
  const goneUntilNarrowed = ({ narrowed }: { narrowed: boolean }) => (narrowed ? undefined : { code: "executor.target.gone", category: "page_changed" as const });

  it("leaves no row when its retry is declined: nothing judged them, and the run holds what it held", { timeout: 180_000 }, async () => {
    const { run, detail, rows, reads } = await start({
      readFails: goneUntilNarrowed,
      prepare: (service) => {
        const rerunner = service as unknown as { rerunAfterRepair: (request: { from?: string }) => Promise<unknown> };
        vi.spyOn(rerunner, "rerunAfterRepair").mockImplementation(async () => ({ declinedCode: "resume_decision_missing" }));
      }
    });

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_action_sequence", traceStatus: "succeeded" }]);
    expect(reads).toEqual([true]);
    expect(run.status).toBe("failed");
    expect(rows).toBeUndefined();
  });

  it("joins the run when a retry takes it up, ahead of the rows the retry reads", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary } = await start({ readFails: goneUntilNarrowed });

    expect(detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded" });
    expect(run.status).toBe("succeeded");
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { collected: 20, duplicates: 10, kept: 10 } });
  });
});

describe("a repaired run's dataset", () => {
  it("reads as a clean run's once a repair re-runs the Flow from its start: nothing of the replaced pass decides the order", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary, reads } = await start({ noOpen: true, reauthor: narrowTheRead });

    expect(detail?.metadata?.repairedRerun).toMatchObject({ attempted: true, status: "succeeded" });
    expect(reads).toEqual([false, true]);
    expect(run.status).toBe("succeeded");
    // Before the fix: listings 7-9 first, then 0-6, the positions the saved run's expected rows held.
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { collected: 10, duplicates: 0, kept: 10 } });
  });

  it("drops a row of the replaced pass the request did not ask for, so a repaired answer can be judged right", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary } = await start({
      noOpen: true,
      reauthor: narrowTheRead,
      reads: ({ asked }) => (asked ? ALL_TEN : [{ name: "not-a-listing" }, ...FIRST_THREE])
    });

    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true });
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { collected: 10, duplicates: 0, kept: 10 } });
    expect(run.status).toBe("succeeded");
  });
});
