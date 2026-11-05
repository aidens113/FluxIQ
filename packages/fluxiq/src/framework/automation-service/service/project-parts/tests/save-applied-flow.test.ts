// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectPartStore } from "../../../../persistence/automation/index.ts";
import { PAGE_TEXT, partGraphFixture, partSubflowFixture } from "../../../../../runtime/project-parts/tests/fixtures.ts";
import { saveProjectPartsOfAppliedFlow, type AutomationStudioAppliedFlowPart } from "../index.ts";

// What a Flow's save writes into the project's library: every non-primary part,
// a primary only when the person asked, a copy once, a changed shape as the next
// version, and never a word the page said.
let rootDir = "";
const PROJECT = "project.save";

function part(options: { key?: string; subflowId?: string; role?: "primary" | "utility"; explicit?: boolean; graph?: ReturnType<typeof partGraphFixture> } = {}): AutomationStudioAppliedFlowPart {
  const key = options.key ?? "search";
  return {
    subflow: partSubflowFixture({ subflowId: options.subflowId ?? `subflow.${key}`, key, role: options.role ?? "utility", name: `Part ${key}` }),
    graphFlow: options.graph ?? partGraphFixture({ graphFlowId: `flow.${key}.graph` }),
    ...(options.explicit !== undefined ? { explicit: options.explicit } : {}),
    sourceGraphRevision: 2
  };
}

describe("saveProjectPartsOfAppliedFlow", () => {
  let pool: AutomationStudioProjectDatabasePool;
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-save-parts-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  const save = (subflows: AutomationStudioAppliedFlowPart[], extra: { requestWords?: string; flowId?: string } = {}) =>
    saveProjectPartsOfAppliedFlow({ pool, projectId: PROJECT, flowId: extra.flowId ?? "flow.main", subflows, requestWords: extra.requestWords ?? "find me shoes", now: 9_000 });

  it("saves a non-primary part, and a primary one only when the person asked for it", async () => {
    const result = await save([part({ key: "main", role: "primary" }), part({ key: "search" }), part({ key: "kept", role: "primary", explicit: true, graph: partGraphFixture({ graphFlowId: "flow.kept.graph", searchBoxId: "other" }) })]);
    expect(result.saved.map((saved) => [saved.subflowId, saved.version, saved.status])).toEqual([["subflow.search", 1, "created"], ["subflow.kept", 1, "created"]]);
    expect(result.skipped).toEqual([{ subflowId: "subflow.main", reason: "part.primary_not_explicit" }]);
  });

  it("keeps a copy under other names once, and returns the part that is already there", async () => {
    const first = await save([part({ key: "search" })]);
    const copy = await save([part({ key: "lookup", graph: partGraphFixture({ graphFlowId: "flow.lookup.graph", renamed: true, typed: "blue hats" }) })], { flowId: "flow.other" });
    expect(copy.saved).toEqual([{ subflowId: "subflow.lookup", partId: first.saved[0]!.partId, version: 1, status: "existing" }]);
    const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
    expect((await store.query({})).items).toHaveLength(1);
    await store.close();
  });

  it("writes the next version when the same part comes back in a new shape, and the same one when it does not", async () => {
    const first = await save([part({ key: "search" })]);
    expect((await save([part({ key: "search" })])).saved[0]).toMatchObject({ partId: first.saved[0]!.partId, version: 1, status: "existing" });
    const changed = await save([part({ key: "search", graph: partGraphFixture({ graphFlowId: "flow.search.graph", searchBoxId: "new-box" }) })]);
    expect(changed.saved[0]).toMatchObject({ partId: first.saved[0]!.partId, version: 2, status: "new_version" });
    const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
    expect((await store.listVersions(first.saved[0]!.partId)).map((version) => version.version)).toEqual([2, 1]);
    await store.close();
  });

  it("derives the part id from the Flow and the part's key, so a rebuild under new ids is the same part", async () => {
    const one = await save([part({ key: "search", subflowId: "subflow.bootstrap.aaa.search" })]);
    const two = await save([part({ key: "search", subflowId: "subflow.bootstrap.bbb.search", graph: partGraphFixture({ graphFlowId: "flow.x.graph", searchBoxId: "changed" }) })]);
    expect(two.saved[0]!.partId).toBe(one.saved[0]!.partId);
    // A shape already in the library is kept once whichever Flow brings it, so another Flow's own part needs a shape of its own.
    const other = await save([part({ key: "search", graph: partGraphFixture({ searchBoxId: "third" }) })], { flowId: "flow.second" });
    expect(other.saved[0]!.partId).not.toBe(one.saved[0]!.partId);
  });

  it("refuses a lasting part that holds a literal from the person's request, as a result and not an error", async () => {
    const graph = partGraphFixture({ consequences: ["create_new"] });
    const result = await save([part({ key: "cart", graph })], { requestWords: "add the red shoes to my cart" });
    expect(result.saved).toEqual([]);
    expect(result.skipped).toEqual([{ subflowId: "subflow.cart", reason: "part.fixed_value_from_request" }]);
  });

  it("writes nothing a page said into any row the library searches or shows", async () => {
    await save([part({ key: "search" })], { requestWords: "find me some shoes" });
    const lease = await pool.acquire(PROJECT);
    try {
      const rows = {
        versions: await lease.database.all("select card_json from project_part_versions"),
        facets: await lease.database.all("select * from project_part_facets"),
        fts: await lease.database.all("select name, purpose, ports from project_parts_fts"),
        parts: await lease.database.all("select * from project_parts"),
        calls: await lease.database.all("select * from part_calls")
      };
      const shown = JSON.stringify(rows);
      expect(shown).not.toContain("PAGEWORD");
      for (const text of Object.values(PAGE_TEXT)) expect(shown).not.toContain(text);
      expect(shown).not.toContain("secret-path-and-query");
      expect(rows.fts).toHaveLength(1);
    } finally {
      await lease.release();
    }
  });

  it("orders callers after what they call, records the call, and calls the existing version of a copy", async () => {
    const caller = partGraphFixture({ graphFlowId: "flow.outer.graph", searchBoxId: "outer" });
    caller.nodes.push({ id: "a.call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "subflow.search" }, metadata: {} });
    caller.edges.push({ id: "a.call.edge", sourceNodeId: "a.click", targetNodeId: "a.call", sourcePortId: "success", targetPortId: "in" });
    const main = partGraphFixture({ graphFlowId: "flow.main.graph", searchBoxId: "main" });
    main.nodes.push({ id: "a.callouter", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: "subflow.outer" }, metadata: {} });
    main.edges.push({ id: "a.callouter.edge", sourceNodeId: "a.click", targetNodeId: "a.callouter", sourcePortId: "success", targetPortId: "in" });
    const result = await save([part({ key: "main", role: "primary", graph: main }), part({ key: "outer", graph: caller }), part({ key: "search" })]);
    expect(result.saved.map((saved) => saved.subflowId)).toEqual(["subflow.search", "subflow.outer"]);
    const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
    const searchId = result.saved[0]!.partId;
    const outer = await store.getVersion(result.saved[1]!.partId, 1);
    expect((outer?.card as { calls: unknown[] }).calls).toEqual([{ partId: searchId, version: 1 }]);
    expect((await store.listCallsTo({ partId: searchId })).map((call) => [call.callerKind, call.callerNodeId])).toEqual([["part_version", "a.call"]]);
    expect((await store.listCallsTo({ partId: result.saved[1]!.partId })).map((call) => [call.callerKind, call.callerId, call.callerNodeId])).toEqual([["flow_graph", "flow.main.graph", "a.callouter"]]);
    await store.close();
  });

  it("skips parts on a cycle of calls, and a caller of a part that was skipped", async () => {
    const calling = (target: string, id: string) => {
      const graph = partGraphFixture({ graphFlowId: `flow.${id}.graph`, searchBoxId: id });
      graph.nodes.push({ id: "a.call", definitionId: "builtin.control.call-subflow", parameterValues: { subflowId: target }, metadata: {} });
      graph.edges.push({ id: "a.call.edge", sourceNodeId: "a.click", targetNodeId: "a.call", sourcePortId: "success", targetPortId: "in" });
      return graph;
    };
    const result = await save([
      part({ key: "ping", graph: calling("subflow.pong", "ping") }),
      part({ key: "pong", graph: calling("subflow.ping", "pong") }),
      part({ key: "onlooker", graph: calling("subflow.ping", "onlooker") })
    ]);
    expect(result.saved).toEqual([]);
    expect(result.skipped.map((skipped) => [skipped.subflowId, skipped.reason]).sort()).toEqual([["subflow.onlooker", "part.unresolved_call"], ["subflow.ping", "part.call_cycle"], ["subflow.pong", "part.call_cycle"]]);
  });

  it("lets a database failure through rather than reporting a skip", async () => {
    const closed = new AutomationStudioProjectDatabasePool({ rootDir: path.join(rootDir, "missing", "\0bad") });
    await expect(saveProjectPartsOfAppliedFlow({ pool: closed, projectId: PROJECT, flowId: "flow.main", subflows: [part()], requestWords: "x" })).rejects.toThrow();
  });
});
