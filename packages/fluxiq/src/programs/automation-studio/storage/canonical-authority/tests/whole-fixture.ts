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
  await mkdir(globalRoot);
  if (mode === "sql") await writeFile(path.join(globalRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
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

/** A created project at rest: every connection closed, so the directory alone holds the state and can be copied. */
export type WholeProjectTemplate = { mode: Mode; root: string; project: WholeFixture["project"] };
/** One created Flow at rest, in its project. */
export type WholeFlowTemplate = WholeProjectTemplate & { flow: CreatedFlow };
async function sidecars(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await sidecars(child));
    else if (/-(wal|shm|journal)$/.test(entry.name)) found.push(child);
  }
  return found;
}
/** A fresh fixture, or a private copy of `from` with fresh owners over it. */
async function start(mode: Mode, from?: WholeProjectTemplate): Promise<WholeFixture> {
  if (!from) return setup(mode);
  const root = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  try {
    await cp(from.root, root, { recursive: true });
    return { ...await wire(root, from.mode), project: structuredClone(from.project) };
  } catch (error) {
    await removeRoot(root);
    throw error;
  }
}
/** Builds a fixture (from `from` when given), lets `extend` add to it, and leaves it at rest as a template. */
async function template<T extends object>(mode: Mode, extend: (fixture: WholeFixture) => Promise<T>, from?: WholeProjectTemplate): Promise<WholeProjectTemplate & T> {
  const fixture = await start(mode, from);
  try {
    const extra = await extend(fixture);
    await fixture.pool.closeAll();
    // An open WAL would make the copy a torn snapshot; the last close checkpoints and removes it.
    const open = await sidecars(fixture.root);
    if (open.length) throw new Error(`Template still has open SQLite sidecars: ${open.join(", ")}`);
    return { mode, root: fixture.root, project: structuredClone(fixture.project), ...structuredClone(extra) };
  } catch (error) {
    await fixture.pool.closeAll();
    await removeRoot(fixture.root);
    throw error;
  }
}
/**
 * Builds the project once per test file. Creating it is a whole canonical
 * operation, about 900 ms and hundreds of sequential SQLite round trips alone,
 * which a loaded package run stretched past the 15 s test limit (sweep
 * 2026-10-19b, t731); a test whose subject is the next operation copies this
 * instead (a few files, no SQL).
 */
export async function wholeProjectTemplate(mode: Mode): Promise<WholeProjectTemplate> {
  return template(mode, async () => ({}));
}
/**
 * Builds the project and its Flow once per test file. Creating them costs
 * about 850 ms of a 1 s corruption test alone, and about 1,000 sequential
 * SQLite round trips, each of which a loaded machine stretches; a test that
 * only probes the next save copies this instead (a few files, no SQL). Given a
 * project template, it creates only the Flow, in a copy of that project.
 */
export async function wholeFlowTemplate(mode: Mode, project?: WholeProjectTemplate): Promise<WholeFlowTemplate> {
  return template(mode, async fixture => ({ flow: await fixture.creation.createFlow({ projectId: fixture.project.id, name: "Original" }) }), project);
}
export async function disposeWholeFlowTemplate(template: WholeProjectTemplate | undefined): Promise<void> {
  if (template) await removeRoot(template.root);
}
/** A private copy of the template with fresh owners over it, as a restarted process would open it. */
async function fromTemplate<T extends WholeProjectTemplate>(template: T, run: (fixture: WholeFixture & Omit<T, "mode" | "root">) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), PREFIX));
  let fixture: (WholeFixture & Omit<T, "mode" | "root">) | undefined;
  try {
    await cp(template.root, root, { recursive: true });
    const { mode, root: _templateRoot, ...state } = template;
    fixture = { ...await wire(root, mode), ...structuredClone(state) } as WholeFixture & Omit<T, "mode" | "root">;
    await run(fixture);
  } finally {
    await fixture?.pool.closeAll();
    await removeRoot(root);
  }
}
/** A private copy of a project template, its project created and nothing else. */
export async function wholeProjectFromTemplate(template: WholeProjectTemplate, run: (fixture: WholeFixture) => Promise<void>) {
  await fromTemplate(template, run);
}
/** A private copy of a Flow template, its project and Flow created. */
export async function wholeFlowFromTemplate(template: WholeFlowTemplate, run: (fixture: WholeFixture & { flow: CreatedFlow }) => Promise<void>) {
  await fromTemplate(template, run);
}
