import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { SQLiteRepository } from "../../../../database-manager/index.ts";
import { createCanonicalAutomationStudioSQLiteRepositories, AutomationStudioProjectDatabasePool } from "../../index.ts";
import { CanonicalAuthorityWholeOperation } from "../whole-operation.ts";
import { AutomationStudioProjectPaths, AutomationStudioFlowPaths } from "../../../runtime/service/paths/index.ts";
import { AutomationStudioProjectCreation, AutomationStudioProjectStore } from "../../../runtime/service/projects/index.ts";
import { AutomationStudioServiceIndexes } from "../../../runtime/service/indexes/index.ts";
import { AutomationStudioFlowCreation, AutomationStudioFlowWriter, AutomationStudioFlowStore } from "../../../runtime/service/flows/index.ts";

type Mode = "sql" | "file";
const PREFIX = "whole-writer-";

function roots(root: string, mode: Mode) {
  const globalRoot = path.join(root, ".fluxiq"), databaseRoot = mode === "sql" ? path.join(globalRoot, "artifacts", "automation-studio") : path.join(root, "automation");
  return { globalRoot, databaseRoot, projectRoot: path.join(databaseRoot, "projects") };
}
/** Fresh owners over whatever `root` already holds: a new empty catalogue, or a copied template. */
async function wire(root: string, mode: Mode) {
  const { globalRoot, databaseRoot, projectRoot } = roots(root, mode), paths = new AutomationStudioProjectPaths(projectRoot), flowPaths = new AutomationStudioFlowPaths(paths);
  const repositories = createCanonicalAutomationStudioSQLiteRepositories(globalRoot), options = { projectRootDir: projectRoot, projectDatabaseRootDir: databaseRoot }, authority = await CanonicalAuthorityWholeOperation.fromFactory(repositories, options);
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: databaseRoot }), projects = new AutomationStudioProjectStore(paths, undefined, authority), indexes = new AutomationStudioServiceIndexes(paths, projects, authority), flows = new AutomationStudioFlowStore(paths, flowPaths, projects, indexes, repositories, pool, authority);
  const writer = new AutomationStudioFlowWriter(paths, flowPaths, projects, indexes, flows, {} as never, {} as never, repositories, {} as never, pool, authority), creation = new AutomationStudioFlowCreation(projects, flows, repositories, writer, authority);
  const database = new SQLiteRepository({ rootDir: globalRoot, kind: "automation.flows", layoutVersion: 2 });
  return { root, globalRoot, databaseRoot, repositories, options, authority, pool, projects, flows, paths, flowPaths, creation, writer, database };
}
async function setup(mode: Mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), PREFIX)), { globalRoot, projectRoot } = roots(root, mode);
  await mkdir(globalRoot); if (mode === "sql") await writeFile(path.join(globalRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  // Explicit isolated existing-catalogue setup, not production initialization/adoption.
  await new ProgramJsonStore(path.join(projectRoot, "index.json"), () => ({})).write({ projects: [], categories: [] });
  const wired = await wire(root, mode);
  const project = await new AutomationStudioProjectCreation(wired.projects, wired.paths, undefined, wired.authority).createProject({ name: "Original" });
  return { ...wired, project };
}
type WholeFixture = Awaited<ReturnType<typeof setup>>;
type CreatedFlow = Awaited<ReturnType<WholeFixture["creation"]["createFlow"]>>;

/**
 * Removes a fixture directory. A connection closed a moment ago can still hold
 * `global.sqlite` or `project.sqlite` on Windows, so the unlink is retried
 * rather than failing the test that already finished.
 */
async function removeRoot(root: string): Promise<void> {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith(PREFIX)) throw new Error("Unsafe fixture cleanup");
  await rm(resolved, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
}
export async function wholeFixture(mode: Mode, run: (fixture: WholeFixture) => Promise<void>) {
  const fixture = await setup(mode);
  try { await run(fixture); }
  finally { await fixture.pool.closeAll(); await removeRoot(fixture.root); }
}

/** One created Flow at rest: every connection closed, so the directory alone holds the state and can be copied. */
export type WholeFlowTemplate = { mode: Mode; root: string; project: WholeFixture["project"]; flow: CreatedFlow };
async function sidecars(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await sidecars(child));
    else if (/-(wal|shm|journal)$/.test(entry.name)) found.push(child);
  }
  return found;
}
/**
 * Builds the project and its Flow once per test file. Creating them costs
 * about 850 ms of a 1 s corruption test alone, and about 1,000 sequential
 * SQLite round trips, each of which a loaded machine stretches; a test that
 * only probes the next save copies this instead (a few files, no SQL).
 */
export async function wholeFlowTemplate(mode: Mode): Promise<WholeFlowTemplate> {
  const fixture = await setup(mode);
  try {
    const flow = await fixture.creation.createFlow({ projectId: fixture.project.id, name: "Original" });
    await fixture.pool.closeAll();
    // An open WAL would make the copy a torn snapshot; the last close checkpoints and removes it.
    const open = await sidecars(fixture.root);
    if (open.length) throw new Error(`Template still has open SQLite sidecars: ${open.join(", ")}`);
    return { mode, root: fixture.root, project: structuredClone(fixture.project), flow: structuredClone(flow) };
  } catch (error) { await fixture.pool.closeAll(); await removeRoot(fixture.root); throw error; }
}
export async function disposeWholeFlowTemplate(template: WholeFlowTemplate | undefined): Promise<void> {
  if (template) await removeRoot(template.root);
}
/** A private copy of the template with fresh owners over it, as a restarted process would open it. */
export async function wholeFlowFromTemplate(template: WholeFlowTemplate, run: (fixture: WholeFixture & { flow: CreatedFlow }) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  let fixture: (WholeFixture & { flow: CreatedFlow }) | undefined;
  try {
    await cp(template.root, root, { recursive: true });
    fixture = { ...await wire(root, template.mode), project: structuredClone(template.project), flow: structuredClone(template.flow) };
    await run(fixture);
  } finally { await fixture?.pool.closeAll(); await removeRoot(root); }
}
