// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectFlowGraphJudgementStore } from "../../../../persistence/automation/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID, type AutomationStudioHarnessOptionLoopBinding, type AutomationStudioLlmEvidenceTool, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { partGraphFixture, partSubflowFixture } from "../../../../../runtime/project-parts/tests/fixtures.ts";
import { AutomationStudioProjectParts, automationStudioAnswerFirstKnownParts, automationStudioProjectBuildKnownParts, saveProjectPartsOfAppliedFlow, type AutomationStudioProjectPartsPorts } from "../index.ts";

// The opening look's shortlist: this project's own parts, ranked, never an unproven lasting part and never a class that
// was not asked; `core.run_part` offered only when there is something to offer; and a version that remembers every
// graph it came from, so the judged runs of a second copy reach its trust.
const PROJECT = "project.known";
const SHOP = "https://shop.example";

type Seed = { key: string; name: string; box?: string; site?: string; consequences?: string[]; revision?: number };

describe("the known parts of a project", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool;
  let parts: AutomationStudioProjectParts;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-known-parts-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    parts = new AutomationStudioProjectParts({ pool, ports: {} as unknown as AutomationStudioProjectPartsPorts });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  const seed = async (...seeds: Seed[]) => {
    const ids: Record<string, string> = {};
    for (const item of seeds) {
      const graph = partGraphFixture({ graphFlowId: `flow.${item.key}.graph`, searchBoxId: item.box ?? item.key, typed: null, ...(item.consequences ? { consequences: item.consequences } : {}) });
      if (item.site) graph.nodes[0] = { ...graph.nodes[0]!, parameterValues: { url: `${item.site}/start` } };
      const result = await saveProjectPartsOfAppliedFlow({
        pool, projectId: PROJECT, flowId: "flow.main", requestWords: "find things", startLocation: `${item.site ?? SHOP}/start`, now: 5_000,
        subflows: [{ subflow: partSubflowFixture({ subflowId: `subflow.${item.key}`, key: item.key, name: item.name }), graphFlow: graph, sourceGraphRevision: item.revision ?? 2 }]
      });
      if (result.skipped.length) throw new Error(`skipped ${item.key}: ${JSON.stringify(result.skipped)}`);
      ids[item.key] = result.saved[0]!.partId;
    }
    return ids;
  };
  const judged = async (graphFlowId: string, revision: number, runId = `run.${graphFlowId}.${revision}`) => {
    const store = await AutomationStudioProjectFlowGraphJudgementStore.open({ pool, projectId: PROJECT });
    await store.record({ runId, status: "confirmed", code: "core.result.answers", instructionDigest: null, decidedAtMs: 7_000, versions: [{ graphFlowId, revision }] });
    await store.close();
  };
  const ask = (more: Partial<Parameters<AutomationStudioProjectParts["shortlist"]>[0]> = {}) => parts.shortlist({ projectId: PROJECT, requestWords: "search the catalogue", startLocation: `${SHOP}/start`, askedClasses: [], ...more });

  it("offers nothing for a project with no part, and nothing that is not a part's own to this project", async () => {
    expect(await ask()).toBeUndefined();
    await seed({ key: "search", name: "Search the catalogue" });
    expect(await parts.shortlist({ projectId: "project.other", requestWords: "search the catalogue", askedClasses: [] })).toBeUndefined();
    expect((await ask())?.parts.map((part) => part.name)).toEqual(["Search the catalogue"]);
  });

  it("puts the start location's origin first, then the person's words, and shows each card's own fields", async () => {
    await seed({ key: "elsewhere", name: "Search the catalogue elsewhere", site: "https://other.example" }, { key: "browse", name: "Browse the aisles" }, { key: "search", name: "Search the catalogue" });
    const shortlist = await ask();
    expect(shortlist?.parts.map((part) => part.name)).toEqual(["Search the catalogue", "Browse the aisles", "Search the catalogue elsewhere"]);
    expect(shortlist?.parts[0]).toMatchObject({ version: 1, sites: [SHOP], fixedValues: [], lastingClasses: [], trust: "unproven", inputs: [{ id: "query" }], outputs: [{ id: "results" }] });
    expect(shortlist?.note).toMatch(/only a suggestion/u);
    // Without a start location the words alone rank, and the shop's parts are not lifted over the others.
    expect((await ask({ startLocation: undefined }))?.parts[0]?.name).toBe("Search the catalogue");
  });

  it("offers at most five", async () => {
    await seed(...["a", "b", "c", "d", "e", "f", "g"].map((key) => ({ key, name: `Search the catalogue ${key}` })));
    expect((await ask())?.parts).toHaveLength(5);
  });

  it("never offers an unproven part with a lasting act, nor one whose lasting classes were not asked", async () => {
    await seed({ key: "reads", name: "Search the catalogue" }, { key: "makes", name: "Search then create", consequences: ["create_new"] }, { key: "removes", name: "Search then delete", consequences: ["delete"] });
    // Unproven: only the part that does nothing lasting.
    expect((await ask({ askedClasses: ["create_new", "delete"] }))?.parts.map((part) => part.name)).toEqual(["Search the catalogue"]);
    await judged("flow.makes.graph", 2);
    await judged("flow.removes.graph", 2);
    expect((await ask({ askedClasses: ["create_new"] }))?.parts.map((part) => part.name).sort()).toEqual(["Search the catalogue", "Search then create"]);
    expect((await ask({ askedClasses: [] }))?.parts.map((part) => part.name)).toEqual(["Search the catalogue"]);
    expect((await ask({ askedClasses: ["create_new", "delete"] }))?.parts.find((part) => part.name === "Search then create")).toMatchObject({ trust: "provisional", lastingClasses: ["create_new"] });
  });

  it("reads trust from every graph a version came from: a copy saved without a revision, then applied and judged", async () => {
    const draft = await saveProjectPartsOfAppliedFlow({
      pool, projectId: PROJECT, flowId: "flow.main", requestWords: "find things", startLocation: `${SHOP}/start`, now: 5_000,
      subflows: [{ subflow: partSubflowFixture({ subflowId: "subflow.draft", key: "make", name: "Search then create" }), graphFlow: partGraphFixture({ graphFlowId: "flow.draft.graph", typed: null, consequences: ["create_new"] }) }]
    });
    const partId = draft.saved[0]!.partId;
    expect(await ask({ askedClasses: ["create_new"] })).toBeUndefined();
    // The applied copy has other ids and a revision, and the same shape: no version is written, its graph is another source.
    const applied = await saveProjectPartsOfAppliedFlow({
      pool, projectId: PROJECT, flowId: "flow.main", requestWords: "find things", startLocation: `${SHOP}/start`, now: 6_000,
      subflows: [{ subflow: partSubflowFixture({ subflowId: "subflow.applied", key: "make", name: "Search then create" }), graphFlow: partGraphFixture({ graphFlowId: "flow.applied.graph", typed: null, consequences: ["create_new"], renamed: true }), sourceGraphRevision: 4 }]
    });
    expect(applied.saved[0]).toMatchObject({ partId, version: 1, status: "existing" });
    expect(await ask({ askedClasses: ["create_new"] })).toBeUndefined();
    await judged("flow.applied.graph", 4);
    expect((await ask({ askedClasses: ["create_new"] }))?.parts[0]).toMatchObject({ partId, version: 1, trust: "provisional" });
    const listed = await parts.list({ projectId: PROJECT });
    expect("parts" in listed && listed.parts[0]?.trust.tier).toBe("provisional");
    const got = await parts.get({ projectId: PROJECT, partId });
    expect("card" in got && got.card.trust.tier).toBe("provisional");
    expect("versions" in got && got.versions).toHaveLength(1);
  });

  it("is read once for a project build, from the active instructions and what the build may do", async () => {
    await seed({ key: "search", name: "Search the catalogue" });
    const asked: unknown[] = [];
    const counting = { shortlist: (input: Parameters<AutomationStudioProjectParts["shortlist"]>[0]) => (asked.push(input), parts.shortlist(input)) };
    const project = { parts: counting, instructions: [{ body: "search the catalogue", status: "active" }, { body: "something retired", status: "archived" }], permissions: { permittedConsequences: ["create_new"] } };
    const first = await automationStudioProjectBuildKnownParts(project, { projectId: PROJECT, startLocation: `${SHOP}/start` });
    const second = await automationStudioProjectBuildKnownParts(project, { projectId: PROJECT, startLocation: `${SHOP}/start` });
    expect(second).toBe(first);
    expect(first?.parts.map((part) => part.name)).toEqual(["Search the catalogue"]);
    expect(asked).toEqual([{ projectId: PROJECT, requestWords: "search the catalogue", startLocation: `${SHOP}/start`, askedClasses: ["create_new"] }]);
    expect(await automationStudioProjectBuildKnownParts({ ...project, parts: undefined }, { projectId: PROJECT, startLocation: undefined })).toBeUndefined();
    // A library that cannot be read answers as none, whoever asks.
    const broken = new AutomationStudioProjectParts({ pool: { acquire: async () => { throw new TypeError("disk gone"); } } as unknown as AutomationStudioProjectDatabasePool, ports: {} as unknown as AutomationStudioProjectPartsPorts });
    expect(await automationStudioProjectBuildKnownParts({ ...project, parts: broken }, { projectId: PROJECT, startLocation: undefined })).toBeUndefined();
  });

  describe("an answer-first attempt's tools and first look", () => {
    const LOOK: AutomationStudioLlmEvidenceTool = { toolId: "web.read", description: "Look at the page", inputSchema: { type: "object" }, effect: "observe" };
    const base = (calls: { callId: string; toolId: string }[]): AutomationStudioHarnessOptionLoopBinding => ({
      tools: [LOOK],
      executeTool: async (call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
        calls.push({ callId: call.callId, toolId: call.toolId });
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "the page" }, effectApplied: false, targetsUnchanged: true };
      }
    });
    const attempt = (calls: { callId: string; toolId: string }[]) => ({
      projectId: PROJECT,
      flowId: "flow.main",
      instructionText: "search the catalogue",
      startLocation: `${SHOP}/start` as string | undefined,
      resolution: { scope: { kind: "global" } } satisfies AutomationStudioNodeRegistryResolution,
      parts,
      permissionGround: { permittedConsequences: [] as string[] },
      harnessOptions: base(calls),
      continuingOptions: () => base(calls)
    });
    const open = (options: AutomationStudioHarnessOptionLoopBinding, callId = "initial.web.read") => options.executeTool({ callId, toolId: "web.read", value: {} as JsonObject });

    it("leaves a project with nothing to offer exactly as it was: the same input, the same tool bytes", async () => {
      const calls: { callId: string; toolId: string }[] = [];
      const given = attempt(calls);
      const answered = await automationStudioAnswerFirstKnownParts(given);
      expect(answered).toBe(given);
      expect(JSON.stringify(answered.harnessOptions.tools)).toBe(JSON.stringify(base(calls).tools));
      const look = await open(answered.harnessOptions);
      expect(look).toEqual({ kind: "llm_evidence_tool_execution", evidence: { ok: true, page: "the page" }, effectApplied: false, targetsUnchanged: true });
      // A part that cannot be offered counts as none: an unproven part with a lasting act, and a library that cannot be read.
      await seed({ key: "makes", name: "Search then create", consequences: ["create_new"] });
      expect(await automationStudioAnswerFirstKnownParts(given)).toBe(given);
      const broken = new AutomationStudioProjectParts({ pool: { acquire: async () => { throw new TypeError("disk gone"); } } as unknown as AutomationStudioProjectDatabasePool, ports: {} as unknown as AutomationStudioProjectPartsPorts });
      const down = { ...given, parts: broken };
      expect(await automationStudioAnswerFirstKnownParts(down)).toBe(down);
      expect((await automationStudioAnswerFirstKnownParts({ ...given, parts: undefined })).harnessOptions).toBe(given.harnessOptions);
    });

    it("offers core.run_part in every round and shows the shortlist once, in the first look", async () => {
      await seed({ key: "search", name: "Search the catalogue" });
      const calls: { callId: string; toolId: string }[] = [];
      const given = attempt(calls);
      const answered = await automationStudioAnswerFirstKnownParts(given);
      expect(answered).not.toBe(given);
      expect(answered.harnessOptions.tools.map((tool) => tool.toolId)).toEqual(["web.read", AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]);
      expect(answered.continuingOptions().tools.map((tool) => tool.toolId)).toEqual(["web.read", AUTOMATION_STUDIO_LLM_RUN_PART_TOOL_ID]);
      const first = (await open(answered.harnessOptions)) as AutomationStudioLlmEvidenceToolExecutionResult;
      expect(first.evidence).toMatchObject({ ok: true, page: "the page", knownParts: { parts: [{ name: "Search the catalogue" }] } });
      const again = (await open(answered.harnessOptions)) as AutomationStudioLlmEvidenceToolExecutionResult;
      expect(again.evidence).toEqual({ ok: true, page: "the page" });
      // Any other call is the domain's, untouched; a call that is not an opening look carries nothing.
      const other = (await open(answered.continuingOptions(), "call.7")) as AutomationStudioLlmEvidenceToolExecutionResult;
      expect(other.evidence).toEqual({ ok: true, page: "the page" });
      expect(calls.map((call) => call.toolId)).toEqual(["web.read", "web.read", "web.read"]);
    });

    it("says nothing in a look that was refused, and tells the next opening look instead", async () => {
      await seed({ key: "search", name: "Search the catalogue" });
      let refuse = true;
      const options = (): AutomationStudioHarnessOptionLoopBinding => ({
        tools: [LOOK],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: refuse ? { ok: false, code: "page.not_ready" } : { ok: true }, effectApplied: false, targetsUnchanged: true })
      });
      const answered = await automationStudioAnswerFirstKnownParts({ ...attempt([]), harnessOptions: options(), continuingOptions: options });
      expect(((await open(answered.harnessOptions)) as AutomationStudioLlmEvidenceToolExecutionResult).evidence).toEqual({ ok: false, code: "page.not_ready" });
      refuse = false;
      expect(((await open(answered.harnessOptions)) as AutomationStudioLlmEvidenceToolExecutionResult).evidence).toHaveProperty("knownParts");
    });
  });
});
