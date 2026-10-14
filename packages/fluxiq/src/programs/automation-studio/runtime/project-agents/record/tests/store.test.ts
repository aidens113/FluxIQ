import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { AutomationStudioProjectBuildRecordStore } from "../index.ts";
import { brief, builderReturn, SOURCE_TEXT, sources, structurePlan, taskSpec } from "../../tests/fixtures.ts";

const ref = { projectId: "project.1", flowId: "flow.1", buildId: "build.1" };
const created = { projectId: ref.projectId, flowId: ref.flowId, buildId: ref.buildId, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] };

function storeAt(root: string | undefined): AutomationStudioProjectBuildRecordStore {
  const projects = new AutomationStudioProjectPaths(root ? path.join(root, "programs", "automation-studio", "projects") : undefined);
  let clock = 1000;
  return new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects), { now: () => (clock += 1) });
}

/** A store with a plan and two briefs that may run at once. */
async function planned(store: AutomationStudioProjectBuildRecordStore): Promise<void> {
  await store.create(created);
  await store.recordTaskSpec(ref, taskSpec(), sources());
  await store.recordPlan(ref, structurePlan());
  await store.recordBrief(ref, brief());
  await store.recordBrief(ref, brief((value) => Object.assign(value, { briefId: "b2", subflowKey: "list_soups", parts: ["p1"], interface: undefined, entry: { caseId: "observed-current", predecessors: [] }, permittedActs: [] })));
}

async function withRoot(sqlite: boolean, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-"));
  try {
    if (sqlite) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
}

describe.each([false, true])("the build record on disk (SQLite=%s)", (sqlite) => {
  it("is written as the build proceeds: a fresh store sees each step as soon as it is recorded", async () => {
    await withRoot(sqlite, async (root) => {
      const writer = storeAt(root);
      await writer.create(created);
      expect((await storeAt(root).read(ref))?.record.taskSpecs).toEqual([]);
      await writer.recordTaskSpec(ref, taskSpec(), sources());
      expect((await storeAt(root).summary(ref))?.taskSpec).toEqual({ revision: 1, digest: taskSpec().digest, parts: 2 });
      await writer.recordPlan(ref, structurePlan());
      expect((await storeAt(root).summary(ref))?.plan).toEqual({ revision: 1, digest: structurePlan().digest, subflows: ["list_soups", "save_recipe"] });
      await writer.recordBrief(ref, brief());
      await writer.recordDecision(ref, { kind: "dispatch", reason: "Saving waits for the list.", briefIds: ["b1"], planDigest: structurePlan().digest });
      await writer.recordAllowance(ref, { role: "builder", briefId: "b1", usd: 0.05 });
      await writer.recordLastingAct(ref, { act: "act-1", owner: { role: "builder", briefId: "b1" }, consequences: ["create_new"], description: "Saved a soup to the cookbook.", undoable: true });
      await writer.recordReturn(ref, builderReturn());
      const summary = await storeAt(root).summary(ref);
      expect(summary).toMatchObject({ briefs: [{ briefId: "b1", current: true, returned: { outcome: "done", spentUsd: 0.02 } }], spentUsd: 0.02, lastingActs: 1, lastDecision: { kind: "dispatch" } });
    });
  });

  it("takes two briefs' returns at the same time, each in its own file, beside concurrent supervisor writes", async () => {
    await withRoot(sqlite, async (root) => {
      const store = storeAt(root);
      await planned(store);
      const second = builderReturn((value) => Object.assign(value, { briefId: "b2", proposal: { subflowKey: "list_soups", revision: 3, digest: "f".repeat(64) }, spentUsd: 0.03 }));
      await Promise.all([
        store.recordReturn(ref, builderReturn()),
        storeAt(root).recordReturn(ref, second),
        store.recordDecision(ref, { kind: "triage", reason: "first", briefIds: ["b1"] }),
        store.recordDecision(ref, { kind: "triage", reason: "second", briefIds: ["b2"] }),
        store.recordAllowance(ref, { role: "supervisor", usd: 0.1 })
      ]);
      const view = await storeAt(root).read(ref);
      expect(view?.returns.map((entry) => [entry.briefId, entry.builderReturn.spentUsd])).toEqual([["b1", 0.02], ["b2", 0.03]]);
      expect(view?.record.decisions.map((entry) => entry.entry.reason).sort()).toEqual(["first", "second"]);
      expect(view?.record.allowances).toHaveLength(1);
      expect((await storeAt(root).summary(ref))?.spentUsd).toBeCloseTo(0.05);
      if (!sqlite) {
        const build = path.join(root, "programs", "automation-studio", "projects", "project.1", "flows", "flow.1", "project-builds", "build.1");
        expect(JSON.parse(await readFile(path.join(build, "returns", "b2.json"), "utf8")).data.briefId).toBe("b2");
      }
    });
  });

  it("reopens after a restart, and refuses a file edited behind its back", async () => {
    await withRoot(sqlite, async (root) => {
      await planned(storeAt(root));
      await storeAt(root).recordReturn(ref, builderReturn());
      const reopened = await storeAt(root).read(ref);
      expect(reopened?.record.briefs.map((entry) => entry.brief.briefId)).toEqual(["b1", "b2"]);
      expect(reopened?.returns.map((entry) => entry.briefId)).toEqual(["b1"]);
      if (sqlite) return;
      const file = path.join(root, "programs", "automation-studio", "projects", "project.1", "flows", "flow.1", "project-builds", "build.1", "build.json");
      const stored = JSON.parse(await readFile(file, "utf8"));
      stored.data.briefs[0].brief.permittedActs = ["create_new", "move_money"];
      await writeFile(file, JSON.stringify(stored));
      await expect(storeAt(root).read(ref)).rejects.toMatchObject({ code: "project.brief_act_not_asked" });
    });
  });
});

describe("the build record's write rules", () => {
  it("refuses a second record for one build and a write to a build never created", async () => {
    const store = storeAt(undefined);
    await expect(store.recordDecision(ref, { kind: "triage", reason: "x", briefIds: [] })).rejects.toMatchObject({ code: "project.record_missing" });
    await store.create(created);
    await expect(store.create(created)).rejects.toMatchObject({ code: "project.record_exists" });
  });

  it("refuses a task spec quoting words the person never wrote, or a source outside the build", async () => {
    const store = storeAt(undefined);
    await store.create(created);
    await expect(store.recordTaskSpec(ref, taskSpec((spec) => (spec.parts[0]!.quote.text = "list every soup")), sources())).rejects.toMatchObject({ code: "project.quote_not_verbatim" });
    await expect(store.recordTaskSpec(ref, taskSpec(), [{ sourceId: "instruction.1", text: "something else" }])).rejects.toMatchObject({ code: "project.quote_not_verbatim" });
    const outside = taskSpec((spec) => (spec.parts[0]!.quote.sourceId = "instruction.9"));
    await expect(store.recordTaskSpec(ref, outside, [...sources(), { sourceId: "instruction.9", text: SOURCE_TEXT }])).rejects.toMatchObject({ code: "project.quote_source_unknown" });
  });

  it("binds a plan to the latest task spec and a brief to the latest plan", async () => {
    const store = storeAt(undefined);
    await store.create(created);
    await expect(store.recordPlan(ref, structurePlan())).rejects.toMatchObject({ code: "project.plan_without_task_spec" });
    await store.recordTaskSpec(ref, taskSpec(), sources());
    await expect(store.recordBrief(ref, brief())).rejects.toMatchObject({ code: "project.brief_without_plan" });
    await expect(store.recordPlan(ref, structurePlan((plan) => (plan.partOf.save_recipe = [])))).rejects.toMatchObject({ code: "project.plan_part_uncovered" });
    await store.recordPlan(ref, structurePlan());
    const replanned = structurePlan((plan) => (plan.partOf.list_soups = ["p1", "p2"]));
    await store.recordPlan(ref, replanned);
    await expect(store.recordBrief(ref, brief())).rejects.toMatchObject({ code: "project.brief_plan_stale" });
    await store.recordBrief(ref, brief(undefined, replanned));
    await expect(store.recordBrief(ref, brief(undefined, replanned))).rejects.toMatchObject({ code: "project.duplicate_brief" });
  });

  it("writes a return once, only for a known brief it answers", async () => {
    const store = storeAt(undefined);
    await planned(store);
    await expect(store.recordReturn(ref, builderReturn((value) => (value.briefId = "b9")))).rejects.toMatchObject({ code: "project.brief_unknown" });
    await expect(store.recordReturn(ref, builderReturn((value) => (value.proposal!.subflowKey = "list_soups")))).rejects.toMatchObject({ code: "project.return_subflow_mismatch" });
    await store.recordReturn(ref, builderReturn());
    await expect(store.recordReturn(ref, builderReturn((value) => (value.reason = "a second answer")))).rejects.toMatchObject({ code: "project.return_exists" });
  });

  it("keeps every lasting act with its owner and classes, and allowances attributed to briefs", async () => {
    const store = storeAt(undefined);
    await planned(store);
    const act = { act: "act-1", owner: { role: "builder" as const, briefId: "b1" }, consequences: ["create_new" as const], description: "Saved a soup to the cookbook.", undoable: true };
    await store.recordLastingAct(ref, act);
    // The supervisor's whole trial, an act the instruction rather than the brief permitted, and one the site cannot undo are all kept.
    await store.recordLastingAct(ref, { act: "act-2", owner: { role: "supervisor" }, consequences: ["create_new"], description: "trial step 2 \"Save\"", undoable: true });
    await store.recordLastingAct(ref, { act: "act-3", owner: { role: "builder", briefId: "b1" }, consequences: ["move_money"], description: "press \"Pay\" button", undoable: false });
    expect((await store.read(ref))!.record.lastingActs.map((entry) => [entry.act, entry.owner, entry.consequences, entry.undoable])).toEqual([
      ["act-1", { role: "builder", briefId: "b1" }, ["create_new"], true],
      ["act-2", { role: "supervisor" }, ["create_new"], true],
      ["act-3", { role: "builder", briefId: "b1" }, ["move_money"], false]
    ]);
    await expect(store.recordLastingAct(ref, act)).rejects.toMatchObject({ code: "project.duplicate" });
    await expect(store.recordLastingAct(ref, { ...act, act: "act-4", owner: { role: "builder", briefId: "b9" } })).rejects.toMatchObject({ code: "project.brief_unknown" });
    await expect(store.recordLastingAct(ref, { ...act, act: "act-5", consequences: [] })).rejects.toMatchObject({ code: "project.act_without_class" });
    await expect(store.recordLastingAct(ref, { ...act, act: "step-6" })).rejects.toMatchObject({ code: "project.invalid_act" });
    await expect(store.recordLastingAct(ref, { ...act, act: "act-7", owner: { role: "supervisor", briefId: "b1" } as unknown as { role: "supervisor" } })).rejects.toMatchObject({ code: "project.act_owner" });
    await expect(store.recordAllowance(ref, { role: "builder", usd: 0.05 })).rejects.toMatchObject({ code: "project.allowance_brief" });
    await expect(store.recordAllowance(ref, { role: "repair", briefId: "b9", usd: 0.05 })).rejects.toMatchObject({ code: "project.brief_unknown" });
  });

  it("closes the main file once the build ends, but still takes a return whose spend happened", async () => {
    const store = storeAt(undefined);
    await planned(store);
    await expect(store.recordDecision(ref, { kind: "ending", reason: "x", briefIds: [] })).rejects.toMatchObject({ code: "project.ending_through_end" });
    await store.end(ref, { outcome: "blocked", reason: "The cookbook needs a sign-in." });
    await expect(store.recordDecision(ref, { kind: "triage", reason: "late", briefIds: [] })).rejects.toMatchObject({ code: "project.record_ended" });
    await store.recordReturn(ref, builderReturn());
    expect(await store.summary(ref)).toMatchObject({ ending: { outcome: "blocked" }, lastDecision: { kind: "ending", planDigest: structurePlan().digest }, spentUsd: 0.02 });
  });
});
