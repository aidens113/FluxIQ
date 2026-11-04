// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ListProjectPartsResponse } from "../../../../../api-contracts/automation.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectPartStore } from "../../../../persistence/automation/index.ts";
import { PAGE_TEXT, partGraphFixture, partSubflowFixture } from "../../../../../runtime/project-parts/tests/fixtures.ts";
import type { AutomationStudioSubflowSummary } from "../../indexes/index.ts";
import { AutomationStudioProjectParts, saveProjectPartsOfAppliedFlow, type AutomationStudioProjectPartsPorts } from "../index.ts";

// The library as the extension reads it: parts of two Flows found by words and by
// exact filters, pages that stay whole when a filter drops rows, a query that is the
// person's own words and not an expression, and an answer that holds no page text.
const PROJECT = "project.library";

type Seed = { flowId?: string; key: string; name: string; input?: string; output?: string; typed?: string | null; box?: string; consequences?: string[] | null; start?: string; calls?: string; firstStep?: "navigate" | "type" };

function graphOf(seed: Seed) {
  const graph = partGraphFixture({
    graphFlowId: `flow.${seed.key}.graph`,
    searchBoxId: seed.box ?? seed.key,
    ...(seed.typed !== undefined ? { typed: seed.typed } : { typed: `typed ${seed.key}` }),
    ...(seed.consequences !== undefined ? { consequences: seed.consequences } : {}),
    ...(seed.firstStep ? { firstStep: seed.firstStep } : {})
  });
  graph.interface = {
    inputs: [{ id: "query", name: seed.input ?? "Search words", valueType: { kind: "string" }, required: true }],
    outputs: [{ id: "results", name: seed.output ?? "Results found", valueType: { kind: "unknown" } }]
  };
  if (seed.calls) {
    graph.nodes.push({ id: "a.call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: seed.calls }, metadata: {} });
    graph.edges.push({ id: "a.call.edge", sourceNodeId: "a.click", targetNodeId: "a.call", sourcePortId: "success", targetPortId: "in" });
  }
  return graph;
}

describe("AutomationStudioProjectParts", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool;
  let parts: AutomationStudioProjectParts;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-library-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    parts = new AutomationStudioProjectParts({ pool, ports: noPorts });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  const seed = async (...seeds: Seed[]) => {
    const byFlow = new Map<string, Seed[]>();
    for (const item of seeds) byFlow.set(item.flowId ?? "flow.main", [...(byFlow.get(item.flowId ?? "flow.main") ?? []), item]);
    const saved: { key: string; partId: string; version: number }[] = [];
    for (const [flowId, group] of byFlow) {
      const result = await saveProjectPartsOfAppliedFlow({
        pool,
        projectId: PROJECT,
        flowId,
        requestWords: "find me things",
        startLocation: group[0]!.start ?? "https://shop.example/start",
        now: 5_000,
        subflows: group.map((item) => ({ subflow: partSubflowFixture({ subflowId: `subflow.${item.key}`, key: item.key, name: item.name, flowId }), graphFlow: graphOf(item), sourceGraphRevision: 2 }))
      });
      expect(result.skipped).toEqual([]);
      saved.push(...result.saved.map((entry) => ({ key: entry.subflowId.replace("subflow.", ""), partId: entry.partId, version: entry.version })));
    }
    return saved;
  };
  const list = async (input: Record<string, unknown> = {}) => {
    const answer = await parts.list({ projectId: PROJECT, ...input });
    if ("ok" in answer) throw new Error(`refused: ${answer.code}`);
    return answer;
  };
  const names = (answer: ListProjectPartsResponse) => answer.parts.map((card) => card.name).sort();
  const recordRuns = async (partId: string, count: number) => {
    const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
    for (let index = 0; index < count; index += 1) await store.recordRun({ partId, version: 1, runId: `run.${partId}.${index}`, outcome: "succeeded", modelCalls: 1, finishedAtMs: 6_000 + index });
    await store.close();
  };

  it("finds the parts of two Flows by words, site, input name and output name", async () => {
    await seed(
      { flowId: "flow.shop", key: "search", name: "Search the shop", start: "https://shop.example/start" },
      { flowId: "flow.hotels", key: "rooms", name: "Find hotel rooms", input: "Destination city", output: "Rooms available", start: "https://hotels.example/start", firstStep: "type" }
    );
    expect(names(await list())).toEqual(["Find hotel rooms", "Search the shop"]);
    expect(names(await list({ query: "hotel" }))).toEqual(["Find hotel rooms"]);
    expect(names(await list({ query: "shop rooms" }))).toEqual(["Find hotel rooms", "Search the shop"]);
    expect(names(await list({ query: "destination" }))).toEqual(["Find hotel rooms"]);
    expect(names(await list({ site: "https://hotels.example" }))).toEqual(["Find hotel rooms"]);
    expect(names(await list({ site: "shop.example" }))).toEqual(["Search the shop"]);
    expect(names(await list({ inputName: "destination city" }))).toEqual(["Find hotel rooms"]);
    expect(names(await list({ inputName: "Search words" }))).toEqual(["Search the shop"]);
    expect(names(await list({ outputName: ["Rooms available"] }))).toEqual(["Find hotel rooms"]);
    expect(names(await list({ outputName: "Results found", inputName: "Destination city" }))).toEqual([]);
    expect(names(await list({ sourceFlowId: "flow.shop" }))).toEqual(["Search the shop"]);
  });

  it("filters by what a part can do for good", async () => {
    await seed({ key: "plain", name: "Look around" }, { key: "buys", name: "Buy the thing", consequences: ["move_money"] }, { key: "makes", name: "Make a note", consequences: ["create_new"] });
    expect(names(await list({ lasting: "move_money" }))).toEqual(["Buy the thing"]);
    expect(names(await list({ lasting: ["move_money", "create_new"] }))).toEqual([]);
    expect(names(await list({ lasting: "create_new", query: "note" }))).toEqual(["Make a note"]);
  });

  it("filters by trust and pages through what is left without skipping or repeating a part", async () => {
    const saved = await seed(...Array.from({ length: 7 }, (_, index) => ({ key: `part${index}`, name: `Search kind ${index}`, box: `box${index}` })));
    for (const entry of saved.filter((_, index) => index % 2 === 0)) await recordRuns(entry.partId, 1);
    const proven = names(await list({ trust: "provisional" }));
    expect(proven).toHaveLength(4);
    expect(names(await list({ trust: ["unproven"] }))).toHaveLength(3);
    expect(await list({ trust: "established" })).toMatchObject({ parts: [], hasMore: false });
    expect(await list({ trust: "nonsense" })).toMatchObject({ parts: [], hasMore: false });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: ListProjectPartsResponse = await list({ trust: "provisional", limit: 1, cursor });
      expect(page.parts.length).toBeLessThanOrEqual(1);
      seen.push(...page.parts.map((card) => card.name));
      cursor = page.nextCursor;
      expect(page.hasMore).toBe(cursor !== null);
      pages += 1;
    } while (cursor && pages < 20);
    expect(seen.sort()).toEqual(proven);
    expect(pages).toBe(4);
  });

  it("takes a query full of search operators as words and does not throw", async () => {
    await seed({ key: "search", name: "Search the shop" });
    for (const query of ['shop" OR NEAR(', "shop AND NOT *", "(((", '"', "name:shop -x ^y", "'; drop table project_parts; --", "   ", "* OR *"]) {
      await expect(list({ query })).resolves.toMatchObject({ hasMore: false });
    }
    expect(names(await list({ query: 'shop" OR NEAR(' }))).toEqual(["Search the shop"]);
    expect((await list({ query: "(((" })).parts).toEqual([]);
  });

  it("answers a part with no page text in its card, steps, calls or callers", async () => {
    const [inner, outer] = await seed({ key: "inner", name: "Inner search" }, { key: "outer", name: "Outer search", calls: "subflow.inner" });
    const read = await parts.get({ projectId: PROJECT, partId: outer!.partId });
    if ("ok" in read) throw new Error(read.code);
    const shown = JSON.stringify([read, await list(), await parts.get({ projectId: PROJECT, partId: inner!.partId })]);
    for (const text of Object.values(PAGE_TEXT)) expect(shown).not.toContain(text);
    expect(shown).not.toContain("secret-path-and-query");
    expect(read.steps.some((step) => step.label === "Run Inner search")).toBe(true);
    expect(read.steps.every((step) => !step.label.includes("PAGEWORD"))).toBe(true);
    expect(read.calls).toEqual([{ partId: inner!.partId, version: 1, name: "Inner search", calls: [] }]);
  });

  it("keeps a label that reads as plain words and replaces one that does not", async () => {
    const graph = graphOf({ key: "words", name: "Words" });
    graph.nodes[0]!.label = "Open the search page";
    graph.nodes[1]!.label = "https://shop.example/x?q=1";
    const saved = await saveProjectPartsOfAppliedFlow({ pool, projectId: PROJECT, flowId: "flow.main", requestWords: "", now: 5_000, subflows: [{ subflow: partSubflowFixture({ subflowId: "subflow.words", key: "words", name: "Words" }), graphFlow: graph }] });
    const read = await parts.get({ projectId: PROJECT, partId: saved.saved[0]!.partId });
    if ("ok" in read) throw new Error(read.code);
    expect(read.steps.map((step) => step.label).slice(0, 2)).toEqual(["Open the search page", "Dom type"]);
  });

  it("lists versions with their trust and every caller with the version it pins", async () => {
    const [inner, outer] = await seed({ key: "inner", name: "Inner search" }, { key: "outer", name: "Outer search", calls: "subflow.inner" });
    await recordRuns(inner!.partId, 1);
    const read = await parts.get({ projectId: PROJECT, partId: inner!.partId });
    if ("ok" in read) throw new Error(read.code);
    expect(read.versions).toEqual([{ version: 1, createdAtMs: 5_000, trust: expect.objectContaining({ tier: "provisional" }) }]);
    expect(read.card.trust.tier).toBe("provisional");
    expect(read.callers).toEqual([{ kind: "part", partId: outer!.partId, callerVersion: 1, nodeId: "a.call", version: 1 }]);
    expect(await parts.get({ projectId: PROJECT, partId: inner!.partId, version: 1 })).toMatchObject({ card: { version: 1 } });
  });

  it("answers a part that is not there with a closed code", async () => {
    await seed({ key: "search", name: "Search the shop" });
    expect(await parts.get({ projectId: PROJECT, partId: "part.missing" })).toMatchObject({ ok: false, code: "parts.not_found" });
    expect(await parts.get({ projectId: PROJECT, partId: "not a valid id!" })).toMatchObject({ ok: false, code: "parts.not_found" });
    const [only] = await list().then((answer) => answer.parts);
    expect(await parts.get({ projectId: PROJECT, partId: only!.partId, version: 9 })).toMatchObject({ ok: false, code: "parts.not_found" });
  });

  it("saves a Subflow the person asked for, with their words, and says why when it cannot", async () => {
    const graphs = new Map([["subflow.keep", graphOf({ key: "keep", name: "Keep me" })], ["subflow.unsure", graphOf({ key: "unsure", name: "Unsure", consequences: null })]]);
    const ports: AutomationStudioProjectPartsPorts = {
      listFlowSubflowSummaries: async () => ({ subflows: [...graphs.keys()].map((subflowId) => ({ subflowId }) as AutomationStudioSubflowSummary), total: graphs.size, limit: 100, offset: 0 }),
      getFlowSubflow: async (_project, flowId, subflowId) => (graphs.has(subflowId) ? partSubflowFixture({ subflowId, flowId, role: "primary", key: subflowId.slice(8), name: subflowId.slice(8) }) : null),
      getFlow: async (_project, graphFlowId) => [...graphs.values()].find((graph) => graph.flowId === graphFlowId)!,
      instructionBodies: async () => ["find me shoes"]
    };
    const withGraph: AutomationStudioProjectPartsPorts["getFlowSubflow"] = async (project, flowId, subflowId) => {
      const base = await ports.getFlowSubflow(project, flowId, subflowId);
      return base ? { ...base, graphFlowId: graphs.get(subflowId)!.flowId } : null;
    };
    const bound = new AutomationStudioProjectParts({ pool, ports: { ...ports, getFlowSubflow: withGraph } });
    const saved = await bound.save({ projectId: PROJECT, flowId: "flow.main", subflowId: "subflow.keep", name: "Keep this one", purpose: "Keeps the thing" });
    expect(saved).toMatchObject({ saved: true, version: 1, status: "created" });
    const card = await parts.get({ projectId: PROJECT, partId: (saved as { partId: string }).partId });
    expect(card).toMatchObject({ card: { name: "Keep this one", purpose: "Keeps the thing" } });
    const refused = await bound.save({ projectId: PROJECT, flowId: "flow.main", subflowId: "subflow.unsure" });
    expect(refused).toMatchObject({ saved: false, code: "part.unclassified_step" });
    expect((refused as { message: string }).message).toMatch(/for good/u);
    expect(await bound.save({ projectId: PROJECT, flowId: "flow.main", subflowId: "subflow.nothing" })).toMatchObject({ saved: false, code: "parts.subflow_not_found" });
    expect(names(await list())).toEqual(["Keep this one"]);
  });

  it("answers parts.unavailable for a project with no database, and for a pool that is closing", async () => {
    const none = new AutomationStudioProjectParts({ pool: undefined, ports: noPorts });
    expect(await none.list({ projectId: PROJECT })).toMatchObject({ ok: false, code: "parts.unavailable" });
    expect(await none.get({ projectId: PROJECT, partId: "part.x" })).toMatchObject({ ok: false, code: "parts.unavailable" });
    expect(await none.save({ projectId: PROJECT, flowId: "f", subflowId: "s" })).toMatchObject({ ok: false, code: "parts.unavailable" });
    await pool.closeAll();
    expect(await parts.list({ projectId: PROJECT })).toMatchObject({ ok: false, code: "parts.unavailable" });
  });
});

const noPorts: AutomationStudioProjectPartsPorts = {
  getFlow: async () => { throw new Error("not read"); },
  getFlowSubflow: async () => null,
  listFlowSubflowSummaries: async () => ({ subflows: [], total: 0, limit: 100, offset: 0 }),
  instructionBodies: async () => []
};
