// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AutomationStudioProjectPartStore, type AutomationStudioProjectPartWrite } from "../index.ts";

// The parts library's store: a version is written whole or not at all, never
// edited, and found by exact filters and by the words a person searches with.
let rootDir = "";

function write(overrides: Partial<AutomationStudioProjectPartWrite> & { name?: string; purpose?: string; ports?: string[] } = {}): AutomationStudioProjectPartWrite {
  const name = overrides.name ?? "Search the shop";
  const purpose = overrides.purpose ?? "Look an item up";
  const ports = overrides.ports ?? ["Search words", "Results found"];
  return {
    partId: "part.one",
    sourceFlowId: "flow.main",
    sourceSubflowId: "subflow.search",
    card: { partId: "part.one", version: 0, name, purpose, sites: ["https://shop.example"] },
    searchable: { name, purpose, ports },
    shapeHash: "a".repeat(64),
    facets: { site: ["https://shop.example"], input: ["query"], output: ["results"], lasting: [] },
    snapshot: { schemaVersion: "test", graph: { nodes: [] } },
    sourceGraphFlowId: "flow.a.graph",
    sourceGraphRevision: 3,
    calls: [],
    now: 5_000,
    ...overrides
  };
}

async function open(projectId: string): Promise<{ pool: AutomationStudioProjectDatabasePool; store: AutomationStudioProjectPartStore }> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  return { pool, store: await AutomationStudioProjectPartStore.open({ pool, projectId }) };
}

async function count(pool: AutomationStudioProjectDatabasePool, projectId: string, table: string): Promise<number> {
  const lease = await pool.acquire(projectId);
  try {
    const row = await lease.database.get<{ n: number }>(`select count(*) as n from ${table}`);
    return row?.n ?? -1;
  } finally {
    await lease.release();
  }
}

describe("AutomationStudioProjectPartStore", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-project-parts-test-"));
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("writes version 1, assigns the version itself, and reads it back with its snapshot", async () => {
    const { pool, store } = await open("project.parts");
    const written = await store.writeVersion(write());
    expect(written.status).toBe("created");
    expect(written.version.version).toBe(1);
    expect((written.version.card as { version: number }).version).toBe(1);
    expect(await store.getPart("part.one")).toMatchObject({ latestVersion: 1, sourceFlowId: "flow.main", sourceSubflowId: "subflow.search" });
    expect(await store.getVersion("part.one", 1)).toMatchObject({ shapeHash: "a".repeat(64), sourceGraphFlowId: "flow.a.graph", sourceGraphRevision: 3 });
    expect(await store.readSnapshot("part.one", 1)).toEqual({ schemaVersion: "test", graph: { nodes: [] } });
    await store.close();
    await pool.closeAll();
  });

  it("finds a version by its shape and writes nothing when the shape is already there", async () => {
    const { pool, store } = await open("project.dedupe");
    await store.writeVersion(write());
    expect((await store.findByShapeHash("a".repeat(64)))?.partId).toBe("part.one");
    const again = await store.writeVersion(write({ partId: "part.copy", card: { name: "Copy" } }));
    expect(again.status).toBe("existing");
    expect(again.version.partId).toBe("part.one");
    expect(await store.getPart("part.copy")).toBeUndefined();
    expect(await count(pool, "project.dedupe", "project_part_versions")).toBe(1);
    await store.close();
    await pool.closeAll();
  });

  it("writes the next version for a new shape of the same part, and indexes only the newest", async () => {
    const { pool, store } = await open("project.versions");
    await store.writeVersion(write({ name: "Alpha lookup", purpose: "Alpha" }));
    const next = await store.writeVersion(write({ shapeHash: "b".repeat(64), name: "Bravo lookup", purpose: "Bravo", facets: { site: ["https://shop.example"], input: ["query"], output: ["results"], lasting: ["create_new"] } }));
    expect(next.status).toBe("new_version");
    expect(next.version.version).toBe(2);
    expect((await store.listVersions("part.one")).map((version) => version.version)).toEqual([2, 1]);
    expect((await store.query({ text: "alpha" })).items).toEqual([]);
    expect((await store.query({ text: "bravo" })).items.map((item) => item.version.version)).toEqual([2]);
    expect((await store.query({ lasting: "create_new" })).items).toHaveLength(1);
    expect((await store.query({ lasting: "delete" })).items).toHaveLength(0);
    await store.close();
    await pool.closeAll();
  });

  it("refuses to update or delete a version", async () => {
    const { pool, store } = await open("project.immutable");
    await store.writeVersion(write());
    const lease = await pool.acquire("project.immutable");
    try {
      await expect(lease.database.run("update project_part_versions set card_json = '{}' where part_id = 'part.one'")).rejects.toThrow(/immutable/u);
      await expect(lease.database.run("delete from project_part_versions where part_id = 'part.one'")).rejects.toThrow(/immutable/u);
      expect((await store.getVersion("part.one", 1))?.shapeHash).toBe("a".repeat(64));
    } finally {
      await lease.release();
    }
    await store.close();
    await pool.closeAll();
  });

  it("leaves nothing behind when one write fails part way", async () => {
    const { pool, store } = await open("project.atomic");
    // Two calls from the same node break the call table's key after the version, facets and index rows were written.
    const failing = write({ calls: [{ nodeId: "n1", partId: "part.other", version: 1 }, { nodeId: "n1", partId: "part.other", version: 2 }] });
    await expect(store.writeVersion(failing)).rejects.toThrow();
    for (const table of ["project_parts", "project_part_versions", "project_part_facets", "project_parts_fts", "part_calls", "object_references"]) {
      expect([table, await count(pool, "project.atomic", table)]).toEqual([table, 0]);
    }
    expect(await store.getPart("part.one")).toBeUndefined();
    // And the same write, made right, then succeeds as version 1.
    expect((await store.writeVersion(write())).version.version).toBe(1);
    await store.close();
    await pool.closeAll();
  });

  it("filters exactly, searches the words, and pages", async () => {
    const { pool, store } = await open("project.query");
    await store.writeVersion(write());
    await store.writeVersion(write({
      partId: "part.two", sourceSubflowId: "subflow.two", shapeHash: "c".repeat(64), name: "Fill the form", purpose: "Enter details", ports: ["Email address"],
      facets: { site: ["https://forms.example"], input: ["email"], output: [], lasting: ["send_or_publish"] }, now: 6_000
    }));
    await store.writeVersion(write({ partId: "part.three", sourceSubflowId: "subflow.three", shapeHash: "d".repeat(64), name: "Read the cart", purpose: "Cart rows", ports: ["Cart rows"], now: 7_000 }));
    const ids = async (query: Parameters<AutomationStudioProjectPartStore["query"]>[0]) => (await store.query(query)).items.map((item) => item.part.partId);
    expect(await ids({})).toEqual(["part.three", "part.two", "part.one"]);
    expect(await ids({ site: "https://forms.example" })).toEqual(["part.two"]);
    expect(await ids({ input: "query", output: "results" })).toEqual(["part.three", "part.one"]);
    expect(await ids({ input: ["query", "email"] })).toEqual([]);
    expect(await ids({ lasting: "send_or_publish" })).toEqual(["part.two"]);
    expect(await ids({ text: "email" })).toEqual(["part.two"]);
    expect(await ids({ text: "cart" })).toEqual(["part.three"]);
    expect(await ids({ text: "!!! ???" })).toEqual([]);
    expect(await ids({ text: "form", site: "https://shop.example" })).toEqual([]);
    expect(await ids({ sourceFlowId: "flow.other" })).toEqual([]);
    const first = await store.query({ limit: 2 });
    expect(first.hasMore).toBe(true);
    const second = await store.query({ limit: 2, cursor: first.nextCursor });
    expect([...first.items, ...second.items].map((item) => item.part.partId)).toEqual(["part.three", "part.two", "part.one"]);
    expect(second.hasMore).toBe(false);
    await store.close();
    await pool.closeAll();
  });

  it("finds the parts a Flow's graph calls, and records runs", async () => {
    const { pool, store } = await open("project.calls");
    await store.writeVersion(write());
    await store.recordFlowGraphCall({ flowId: "flow.main.graph", nodeId: "call.1", partId: "part.one", version: 1 });
    expect((await store.query({ callerFlowId: "flow.main.graph" })).items.map((item) => item.part.partId)).toEqual(["part.one"]);
    expect((await store.query({ callerFlowId: "flow.nobody" })).items).toEqual([]);
    expect(await store.listCallsTo({ partId: "part.one", version: 1 })).toEqual([{ callerKind: "flow_graph", callerId: "flow.main.graph", callerVersion: 0, callerNodeId: "call.1", partId: "part.one", version: 1 }]);
    await store.recordRun({ partId: "part.one", version: 1, runId: "run.1", outcome: "succeeded", modelCalls: 0, finishedAtMs: 10 });
    expect(await store.listRuns({ partId: "part.one", version: 1 })).toEqual([{ partId: "part.one", version: 1, runId: "run.1", outcome: "succeeded", modelCalls: 0, finishedAtMs: 10 }]);
    await store.close();
    await pool.closeAll();
  });

  it("remembers every graph a version came from, on a same-shape save too, and never writes another version", async () => {
    const { pool, store } = await open("project.sources");
    const first = await store.writeVersion(write());
    expect(first.status).toBe("created");
    expect(await store.listVersionSources("part.one", 1)).toEqual([{ graphFlowId: "flow.a.graph", revision: 3 }]);
    // The applied copy of a part first saved from a draft, a second Flow's copy under another part id, and a save that knew no revision.
    const copy = await store.writeVersion(write({ partId: "part.copy", sourceGraphFlowId: "flow.b.graph", sourceGraphRevision: 7 }));
    expect(copy.status).toBe("existing");
    expect(copy.version.partId).toBe("part.one");
    expect((await store.writeVersion(write({ sourceGraphFlowId: "flow.c.graph", sourceGraphRevision: null }))).status).toBe("existing");
    await store.writeVersion(write({ sourceGraphFlowId: "flow.c.graph", sourceGraphRevision: null }));
    await store.writeVersion(write({ sourceGraphFlowId: "flow.b.graph", sourceGraphRevision: 7 }));
    expect(await store.listVersionSources("part.one", 1)).toEqual([
      { graphFlowId: "flow.a.graph", revision: 3 },
      { graphFlowId: "flow.b.graph", revision: 7 },
      { graphFlowId: "flow.c.graph", revision: null }
    ]);
    expect((await store.listVersions("part.one")).map((version) => version.version)).toEqual([1]);
    expect(await count(pool, "project.sources", "project_part_versions")).toBe(1);
    expect(await store.getVersion("part.one", 1)).toMatchObject({ sourceGraphFlowId: "flow.a.graph", sourceGraphRevision: 3 });
    await store.close();
    await pool.closeAll();
  });
});
