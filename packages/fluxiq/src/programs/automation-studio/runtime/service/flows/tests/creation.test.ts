import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { CanonicalAuthorityWholeOperation } from "../../../../storage/canonical-authority/index.ts";
import { createCanonicalAutomationStudioSQLiteRepositories, AutomationStudioProjectDatabasePool } from "../../../../storage/index.ts";
import { AutomationStudioProjectPaths, AutomationStudioFlowPaths } from "../../paths/index.ts";
import { AutomationStudioProjectCreation, AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioServiceIndexes } from "../../indexes/index.ts";
import type { AutomationStudioFacadePorts } from "../../facade-ports.ts";
import { AutomationStudioFlowCreation, AutomationStudioFlowWriter, AutomationStudioFlowStore } from "../index.ts";

type Mode = "sql" | "file";
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function removeRoot(root: string) {
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("whole-flow-")) throw new Error("Unsafe fixture cleanup");
  // A connection closed a moment ago can still hold global.sqlite on Windows.
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
}
function layout(root: string, mode: Mode) {
  const globalRoot = path.join(root, ".fluxiq"), databaseRoot = mode === "sql" ? path.join(globalRoot, "artifacts", "automation-studio") : path.join(root, "automation");
  return { globalRoot, databaseRoot, projectRoot: path.join(databaseRoot, "projects") };
}
async function wire(root: string, mode: Mode) {
  const { globalRoot, databaseRoot, projectRoot } = layout(root, mode), paths = new AutomationStudioProjectPaths(projectRoot), flowPaths = new AutomationStudioFlowPaths(paths);
  const repositories = createCanonicalAutomationStudioSQLiteRepositories(globalRoot), authority = await CanonicalAuthorityWholeOperation.fromFactory(repositories, { projectRootDir: projectRoot, projectDatabaseRootDir: databaseRoot });
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: databaseRoot });
  const projects = new AutomationStudioProjectStore(paths, undefined, authority), indexes = new AutomationStudioServiceIndexes(paths, projects, authority), flows = new AutomationStudioFlowStore(paths, flowPaths, projects, indexes, repositories, pool, authority);
  const writer = new AutomationStudioFlowWriter(paths, flowPaths, projects, indexes, flows, {} as never, {} as never, repositories, {} as AutomationStudioFacadePorts, pool, authority);
  const creation = new AutomationStudioFlowCreation(projects, flows, repositories, writer, authority);
  return { repositories, authority, creation, writer, projects, paths, flowPaths, pool };
}
type Project = Awaited<ReturnType<AutomationStudioProjectCreation["createProject"]>>;
async function openSidecars(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await openSidecars(path.join(dir, entry.name)));
    else if (/-(wal|shm|journal)$/.test(entry.name)) found.push(path.join(dir, entry.name));
  }
  return found;
}
// Each mode's project is created once and copied into every test that uses it.
// Creating it is setup, not the subject (about 400 ms and 250 SQL statements
// alone); the tests below exercise the Flow create and save after it.
const created = new Map<Mode, { root: string; project: Project }>(), templateRoots: string[] = [];
beforeAll(async () => {
  for (const mode of ["sql", "file"] as const) {
    const root = await mkdtemp(path.join(os.tmpdir(), "whole-flow-")), { globalRoot, projectRoot } = layout(root, mode);
    templateRoots.push(root);
    await mkdir(globalRoot); if (mode === "sql") await writeFile(path.join(globalRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    await new ProgramJsonStore(path.join(projectRoot, "index.json"), () => ({})).write({ projects: [], categories: [] });
    const { projects, paths, authority, pool } = await wire(root, mode);
    try { created.set(mode, { root, project: await new AutomationStudioProjectCreation(projects, paths, undefined, authority).createProject({ name: "Original" }) }); }
    finally { await pool.closeAll(); }
    // An open WAL would make the copy a torn snapshot; the last close checkpoints and removes it.
    const open = await openSidecars(root); if (open.length) throw new Error(`Template still has open SQLite sidecars: ${open.join(", ")}`);
  }
});
afterAll(async () => { for (const root of templateRoots.splice(0)) await removeRoot(root); created.clear(); });
async function fixture(mode: Mode) {
  const template = created.get(mode)!, root = await mkdtemp(path.join(os.tmpdir(), "whole-flow-"));
  let pool: AutomationStudioProjectDatabasePool | undefined;
  cleanups.push(async () => { await pool?.closeAll(); await removeRoot(root); });
  await cp(template.root, root, { recursive: true });
  const wired = await wire(root, mode); pool = wired.pool;
  return { ...wired, project: structuredClone(template.project) };
}
describe("real generated orchestration Flow writer ingress", () => {
  for (const mode of ["sql", "file"] as const) it(`creates and saves through all actual ${mode} effects under one parent`, async () => {
    const { creation, writer, project, repositories, paths, flowPaths, pool } = await fixture(mode);
    const flow = await creation.createFlow({ projectId: project.id, name: "Original Flow" }); expect(flow.flowId).toMatch(/^flow\.[0-9a-f-]{36}$/);
    const changed = await writer.saveFlowInternal({ projectId: project.id, flow: { ...flow, name: "Changed" } }, false);
    expect((await repositories.flows.get(flow.flowId))?.name).toBe("Changed");
    expect((await new ProgramJsonStore(flowPaths.flowFile(project.id, flow.flowId), () => ({})).read() as { name: string }).name).toBe("Changed");
    const lease = await pool.acquire(project.id);
    try {
      expect(await lease.database.get<{ name: string }>("select name from flows where flow_id=?", [flow.flowId])).toMatchObject({ name: "Changed" });
      expect(await lease.database.get<{ count: number }>("select count(*) as count from canonical_whole_effect_receipts")).toMatchObject({ count: 4 });
      expect(await lease.database.get<{ count: number }>("select count(*) as count from change_feed where entity_id=?", [flow.flowId])).toMatchObject({ count: 2 });
    } finally { await lease.release(); }
    expect(changed.projectId).toBe(project.id); expect(paths.root).toBeDefined();
  });
  it("rejects caller identity and shaped/custom factory ports before first Flow effect", async () => {
    const { creation, project, repositories, authority } = await fixture("sql");
    await expect(creation.createFlow({ projectId: project.id, flowId: "caller-chosen", name: "Forged" })).rejects.toThrow("canonical_whole.caller_flow_id");
    expect(await repositories.flows.get("caller-chosen")).toBeNull();
    await expect(CanonicalAuthorityWholeOperation.fromFactory({ ...repositories }, authority.options)).rejects.toThrow("canonical_whole.factory_provenance");
  });
  it("preserves legacy project lookup before name validation", async () => {
    const findProject = vi.fn(async () => { throw new Error("Unknown original project"); });
    const creation = new AutomationStudioFlowCreation({ findProject } as never, {} as never, {} as never, {} as never);
    await expect(creation.createFlow({ projectId: "missing", name: "" })).rejects.toThrow("Unknown original project");
    expect(findProject).toHaveBeenCalledWith("missing");
  });
  it("preserves caller ID, repair lookup and overridden public saveFlow in legacy mode", async () => {
    const order: string[] = [], project = { id: "legacy-original", domainId: null };
    const findProject = vi.fn(async () => { order.push("project"); return project; }), loadProjectFlow = vi.fn(async () => { order.push("load"); return null; }), get = vi.fn(async () => { order.push("canonical"); return null; });
    const saveFlow = vi.fn(async input => { order.push("facade"); return input.flow; }), saveFlowInternal = vi.fn();
    const creation = new AutomationStudioFlowCreation({ findProject } as never, { loadProjectFlow } as never, { flows: { get } } as never, { saveFlowInternal } as never, undefined, { saveFlow });
    const flow = await creation.createFlow({ projectId: project.id, flowId: "caller-kept", name: "  Legacy  ", description: "  preserved  " });
    expect(flow).toMatchObject({ flowId: "caller-kept", projectId: project.id, name: "Legacy", description: "preserved" }); expect(order).toEqual(["project", "load", "canonical", "facade"]);
    expect(saveFlowInternal).not.toHaveBeenCalled(); expect(saveFlow).toHaveBeenCalledOnce();
  });
});
