// @fluxiq-test-group real-sql
// Two repairs through the real service, the real project store and the real
// ladder, with a scripted model: what a repair that cannot be run spends, and what
// becomes of a read's own target override on a failed step.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActivityRunEnding } from "../../../../../runtime/automation-activity/wording/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../../service.ts";
import { ALL_TEN, carryTheOrderThenNarrow, FIRST_THREE, narrowTheRead, READ_ID, RECORD_OUTPUT, startRepairedRun, type RepairedRunScript } from "../../datasets/tests/repaired-run-harness.ts";

// A judge's no is what refutes these runs; Core's own facts have their own tests.
vi.mock("../../../../../runtime/result-verification/computed-facts/index.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../runtime/result-verification/computed-facts/index.ts")>();
  return { ...actual, automationStudioResultComputedFacts: vi.fn(() => []) };
});

let tempRoot: string;
const services = new Set<AutomationStudioService>();
const start = (script: RepairedRunScript) => startRepairedRun(script, tempRoot, services);

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t854-"));
});
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** Every paid call a repair is: a build's decisions, the ladder's patch, and its diagnosis. Never the judge's. */
const repairCalls = (taskKinds: readonly string[]) => taskKinds.filter((kind) => kind !== "loop_verification");

describe("a refuted run where a stated lasting act landed", () => {
  it("spends nothing on a repair that could not be run, says so, and leaves nothing waiting", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary, presses, taskKinds, service, projectId, graphFlowId } = await start({ noOpen: true, lastingStep: "marked", reauthor: carryTheOrderThenNarrow });

    expect(repairCalls(taskKinds)).toEqual([]);
    expect(presses.filter((control) => control === "order")).toHaveLength(1);
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: "repair_rerun.lasting_act_may_have_landed" });
    expect(detail?.metadata?.resultReauthor).toBeUndefined();
    expect(detail?.metadata?.resultRepair).toMatchObject({ phase: "settled", outcome: "not_rerun" });
    expect(automationStudioActivityRunEnding(detail?.metadata)).toBe("it saved 3 rows, but the check found they don't answer what you asked, and the fix wasn't run: that would repeat what this run already did.");
    expect(run.status).toBe("failed");
    expect(run.metadata?.resultVerification).toMatchObject({ verdict: "does_not_answer" });
    expect(rows).toEqual(FIRST_THREE);
    expect(summary).toMatchObject({ recordCount: 3, processing: { collected: 3, kept: 3 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.narrowed).toBeUndefined();
  });

  it("still builds where nothing lasting was stated", { timeout: 180_000 }, async () => {
    const { run, rows, taskKinds } = await start({ noOpen: true, reauthor: narrowTheRead });

    expect(taskKinds).toContain("evidence_tool_decision");
    expect(run.status).toBe("succeeded");
    expect(rows).toEqual(ALL_TEN);
  });

  // A held edit's pass is on the run's trace too, and the check before each build reads the trace.
  it("is not what a held edit's own pass amounts to: a later repair still builds and runs", { timeout: 180_000 }, async () => {
    const { detail, reads, taskKinds } = await start({
      noOpen: true,
      reauthor: (request, decision) => narrowTheRead(request, decision % 2 === 1 ? 1 : 2),
      reads: ({ asked }) => (asked ? [{ name: "not-a-listing" }, ...ALL_TEN] : [{ name: "not-a-listing" }, ...FIRST_THREE])
    });

    expect(detail?.metadata?.adaptiveRetry).toBeUndefined();
    expect(taskKinds.filter((kind) => kind === "evidence_tool_decision").length).toBeGreaterThanOrEqual(4);
    expect((detail?.metadata?.resultRepair as { attempts: number }).attempts).toBeGreaterThanOrEqual(2);
    expect(reads.length).toBeGreaterThanOrEqual(3);
  });
});

// The ladder could reroute or run steps before the read, and the read would then run as authored, under the same schema.
describe("a refutation by Core's own counts", () => {
  it("required values missing: goes to the re-author, and a re-run that fills them answers", { timeout: 180_000 }, async () => {
    const { run, detail, rows, taskKinds } = await start({ noOpen: true, reauthor: narrowTheRead, reads: ({ asked }) => (asked ? ALL_TEN : [{ name: "" }]) });

    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true });
    expect(detail?.metadata?.resultRepair).toMatchObject({ code: "core.result.required_values_missing" });
    expect(taskKinds).not.toContain("runtime_patch");
    expect(run.status).toBe("succeeded");
    expect(rows).toEqual(ALL_TEN);
  });
});

// `core.result.every_record_refused` has its route (`refuted-result/tests/refusing-codes.test.ts`), and a read never
// reaches it: its capture fails at the step (`engine/automation/records/capture.ts`), so the result check is not asked.
// That failure is a step's, and the wait the ladder offers for it would read the same rows.
describe("a read whose every row its own schema refused", () => {
  const refusedUntilAsked = { diagnosisWantsNoPatch: true, noOpen: true, reads: ({ asked }: { asked: boolean }) => (asked ? ALL_TEN : [{ title: "no name" }]) } satisfies RepairedRunScript;
  /** The repair's edit: the read run again, reading what its fields are for; then the end of the build. */
  const readItAgain = (request: AutomationStudioLlmTaskRequest, decision: number): JsonObject => {
    if (decision > 1) return { kind: "complete", result: { summary: "Read what the fields are for." } };
    const draft = (request.context.evidenceLoop?.evidence as Array<{ toolId?: string; value?: { steps?: Array<{ step?: number; actionId?: string }> } }> | undefined)?.find((entry) => entry.toolId === "core.flow_draft")?.value;
    const read = draft?.steps?.find((step) => step.actionId === READ_ID);
    if (read?.step === undefined) return { kind: "complete", result: { summary: "No step reads the list." } };
    return { kind: "amend_draft", amendments: [{ step: read.step, change: "rerun", input: { node: READ_ID, parameters: { recordOutput: RECORD_OUTPUT, narrowed: "yes" }, consequences: [] } }] };
  };

  it("goes to the re-author, and a re-run that stores the rows is judged and kept", { timeout: 180_000 }, async () => {
    const { run, detail, rows, taskKinds, service, projectId, graphFlowId } = await start({ ...refusedUntilAsked, reauthor: readItAgain });

    expect(detail?.actionAttempts?.some((attempt) => attempt.failure?.code === "record_output.records_refused")).toBe(true);
    expect(taskKinds).toContain("evidence_tool_decision");
    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true, applied: true, attempts: [{ brief: { trigger: "failed_step", failureCode: "record_output.records_refused" } }] });
    expect(run.status).toBe("succeeded");
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(rows).toEqual(ALL_TEN);
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.narrowed).toBe("yes");
  });

  it("builds nothing where a stated lasting act landed before it, and says so", { timeout: 180_000 }, async () => {
    const { run, detail, presses, taskKinds } = await start({ ...refusedUntilAsked, lastingStep: "marked", reauthor: readItAgain });

    expect(taskKinds).not.toContain("evidence_tool_decision");
    expect(presses.filter((control) => control === "order")).toHaveLength(1);
    expect(detail?.metadata?.adaptiveRetry).toEqual({ attempted: false, notResumableCode: "repair_rerun.lasting_act_may_have_landed" });
    expect(automationStudioActivityRunEnding(detail?.metadata)).toBe("a step failed, and the fix wasn't run: that would repeat what this run already did.");
    expect(run.status).toBe("failed");
  });

  it("tells the person plainly when the repair finds no read that fits, and keeps the Flow as it was", { timeout: 180_000 }, async () => {
    const { run, detail, service, projectId, graphFlowId } = await start({ ...refusedUntilAsked, reauthor: () => ({ kind: "complete", result: { summary: "The list holds no such value." } }) });

    expect(run.status).toBe("failed");
    expect(detail?.metadata?.resultReauthor).toMatchObject({ routed: true });
    expect(automationStudioActivityRunEnding(detail?.metadata)).toMatch(/^every row it read was refused by the fields this Flow stores, /u);
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.narrowed).toBeUndefined();
  });
});

describe("a read's own target override on a failed step", () => {
  const goneUntilAimed = ({ targeted }: { targeted: boolean }) => (targeted ? undefined : { code: "executor.target.gone", category: "unexpected_state" as const });
  const overridesTheRead = { patchesTarget: true, readFails: goneUntilAimed } satisfies RepairedRunScript;

  it("reaches a judged continuation whose rows are the answer, and is kept once that run answers", { timeout: 180_000 }, async () => {
    const { run, detail, rows, summary, taskKinds, service, projectId, graphFlowId, replay } = await start({ ...overridesTheRead, reads: ({ asked }) => (asked ? ALL_TEN : FIRST_THREE) });

    // Verified by its rows, and still not resumable on its trial alone: how many rows were owed is the judged run's to say.
    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_target_override", preflightOk: true, resumable: false, notResumableCode: "records_minimum_undeclared", verification: { status: "verified", basis: "records", awaitsJudgedRun: true } }]);
    expect(detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true, status: "succeeded" });
    expect(run.status).toBe("succeeded");
    expect(run.metadata?.resultVerification).toMatchObject({ performed: true, verdict: "answers" });
    expect(rows).toEqual(ALL_TEN);
    expect(summary).toMatchObject({ recordCount: 10, processing: { collected: 10, kept: 10 } });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.target).toMatchObject({ handles: { control: "narrowed-list" } });
    const calls = taskKinds.length;
    await expect(replay()).resolves.toEqual({ status: "succeeded", rows: ALL_TEN });
    expect(taskKinds).toHaveLength(calls);
  });

  it("is not kept when the judged continuation does not answer: rows alone never keep it", { timeout: 180_000 }, async () => {
    const { run, detail, service, projectId, graphFlowId } = await start({ ...overridesTheRead, reads: () => [{ name: "not-a-listing" }, ...ALL_TEN] });

    expect(detail?.metadata?.adaptiveRetry).toMatchObject({ attempted: true });
    expect(run.status).toBe("failed");
    expect(run.metadata?.resultVerification).toMatchObject({ verdict: "does_not_answer" });
    const stored = await service.getFlow(projectId, graphFlowId);
    expect(stored.nodes.find((node) => node.id === "read")?.parameterValues?.target).toBeUndefined();
  });

  it("stays refused where the trial read nothing: no rows observed nothing", { timeout: 180_000 }, async () => {
    const { run, detail, rows } = await start({ ...overridesTheRead, reads: () => [] });

    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_target_override", resumable: false, notResumableCode: "check_unknown", verification: { status: "unverifiable", reason: "evidence_unevaluated" } }]);
    expect(detail?.metadata?.adaptiveRetry).toBeUndefined();
    expect(run.status).toBe("failed");
    expect(rows ?? []).toEqual([]);
  });

  it("does not carry on where the trial went past the read and did something lasting: that would repeat it", { timeout: 180_000 }, async () => {
    const { run, detail, presses, rows } = await start({ ...overridesTheRead, lastingAfterRead: true, reads: () => ALL_TEN });

    expect(presses.filter((control) => control === "confirm")).toHaveLength(1);
    expect(detail?.metadata?.runtimePatchAttempts).toMatchObject([{ kind: "temporary_target_override", retryOriginalAction: false, actedLastingly: true }]);
    expect(detail?.metadata?.adaptiveRetry).toBeUndefined();
    expect(run.status).toBe("failed");
    expect(rows).toBeUndefined();
  });
});
