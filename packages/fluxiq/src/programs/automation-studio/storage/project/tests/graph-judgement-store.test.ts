import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AutomationStudioProjectFlowGraphJudgementStore } from "../graph-judgement-store.ts";

// The table that says which version of which graph a verdict was about. Until
// it existed a verdict keyed to a run and a version chain keyed to a graph were
// never joined, so a Flow could be judged worse with no way to say worse than
// what.

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-flow-graph-judgement-test");

async function openStore(projectId: string): Promise<{ pool: AutomationStudioProjectDatabasePool; store: AutomationStudioProjectFlowGraphJudgementStore }> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const store = await AutomationStudioProjectFlowGraphJudgementStore.open({ pool, projectId });
  return { pool, store };
}

describe("AutomationStudioProjectFlowGraphJudgementStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("writes one row per version the run executed, and reads them back by run and by Flow", async () => {
    const { pool, store } = await openStore("project.judgements");
    await store.record({
      runId: "run.1",
      status: "refuted",
      code: "core.result.does_not_answer",
      instructionDigest: "digest.one",
      decidedAtMs: 1_000,
      versions: [{ graphFlowId: "flow.parent", revision: 4 }, { graphFlowId: "flow.sub.graph", revision: 2, subflowId: "sub.1" }]
    });
    const forRun = await store.listForRun("run.1");
    expect(forRun.map((row) => [row.flowId, row.revisionNumber, row.subflowId])).toEqual([["flow.parent", 4, null], ["flow.sub.graph", 2, "sub.1"]]);
    expect(forRun.every((row) => row.status === "refuted" && row.code === "core.result.does_not_answer" && row.instructionDigest === "digest.one")).toBe(true);
    const forFlow = await store.listForFlow({ flowId: "flow.sub.graph" });
    expect(forFlow).toHaveLength(1);
    expect(forFlow[0]?.decidedAtMs).toBe(1_000);
    await store.close();
    await pool.closeAll();
  });

  // The judgement is what a later rollback compares against, so a confirmed
  // predecessor and a refuted successor have to stand side by side on the same
  // graph rather than one overwriting the other.
  it("keeps a confirmed predecessor beside a refuted successor on the same graph", async () => {
    const { pool, store } = await openStore("project.history");
    await store.record({ runId: "run.1", status: "confirmed", code: "core.result.answers", instructionDigest: "digest.one", decidedAtMs: 10, versions: [{ graphFlowId: "flow.a", revision: 3 }] });
    await store.record({ runId: "run.2", status: "refuted", code: "core.result.does_not_answer", instructionDigest: "digest.one", decidedAtMs: 20, versions: [{ graphFlowId: "flow.a", revision: 4 }] });
    const rows = await store.listForFlow({ flowId: "flow.a" });
    expect(rows.map((row) => [row.revisionNumber, row.status])).toEqual([[4, "refuted"], [3, "confirmed"]]);
    await store.close();
    await pool.closeAll();
  });

  // One run reaches a verdict twice when its result is repaired and the
  // corrected Flow is re-run under the same run id. Where the repair moved the
  // graph both rows stand; where it did not, the settled verdict is the later
  // one and it has to win, because the first was about a Flow since changed.
  it("replaces a row on the same (flow, revision, run) and keeps one on a new revision", async () => {
    const { pool, store } = await openStore("project.repair");
    await store.record({ runId: "run.1", status: "refuted", code: "core.result.does_not_answer", instructionDigest: "digest.one", decidedAtMs: 10, versions: [{ graphFlowId: "flow.a", revision: 3 }] });
    await store.record({ runId: "run.1", status: "confirmed", code: "core.result.answers", instructionDigest: "digest.one", decidedAtMs: 20, versions: [{ graphFlowId: "flow.a", revision: 3 }] });
    expect((await store.listForRun("run.1")).map((row) => [row.revisionNumber, row.status])).toEqual([[3, "confirmed"]]);
    await store.record({ runId: "run.1", status: "confirmed", code: "core.result.answers", instructionDigest: "digest.one", decidedAtMs: 30, versions: [{ graphFlowId: "flow.a", revision: 4 }] });
    expect((await store.listForRun("run.1")).map((row) => row.revisionNumber)).toEqual([4, 3]);
    await store.close();
    await pool.closeAll();
  });

  // Absent is not zero. A graph with no chain is carried on the run as
  // `revision: null` and is never offered here; one that arrives anyway is
  // refused rather than rounded up into a version nobody ever had.
  it("refuses a row that claims a version below 1", async () => {
    const { pool, store } = await openStore("project.absent");
    await expect(store.record({ runId: "run.1", status: "confirmed", code: "core.result.answers", instructionDigest: null, decidedAtMs: 10, versions: [{ graphFlowId: "flow.a", revision: 0 }] })).rejects.toThrow();
    expect(await store.listForRun("run.1")).toEqual([]);
    await store.close();
    await pool.closeAll();
  });

  it("stores an unknown question as null rather than as a digest of nothing", async () => {
    const { pool, store } = await openStore("project.no-question");
    await store.record({ runId: "run.1", status: "refuted", code: "core.result.every_record_refused", instructionDigest: null, decidedAtMs: 10, versions: [{ graphFlowId: "flow.a", revision: 2 }] });
    expect((await store.listForRun("run.1"))[0]?.instructionDigest).toBeNull();
    await store.close();
    await pool.closeAll();
  });
});
