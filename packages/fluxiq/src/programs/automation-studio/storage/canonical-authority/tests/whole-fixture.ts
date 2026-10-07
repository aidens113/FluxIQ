import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

async function setup(mode: "sql" | "file") {
  const root = await mkdtemp(path.join(os.tmpdir(), "whole-writer-")), globalRoot = path.join(root, ".fluxiq"), databaseRoot = mode === "sql" ? path.join(globalRoot, "artifacts", "automation-studio") : path.join(root, "automation");
  await mkdir(globalRoot); if (mode === "sql") await writeFile(path.join(globalRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projectRoot = path.join(databaseRoot, "projects"), paths = new AutomationStudioProjectPaths(projectRoot), flowPaths = new AutomationStudioFlowPaths(paths);
  // Explicit isolated existing-catalogue setup, not production initialization/adoption.
  await new ProgramJsonStore(path.join(projectRoot, "index.json"), () => ({})).write({ projects: [], categories: [] });
  const repositories = createCanonicalAutomationStudioSQLiteRepositories(globalRoot), options = { projectRootDir: projectRoot, projectDatabaseRootDir: databaseRoot }, authority = await CanonicalAuthorityWholeOperation.fromFactory(repositories, options);
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: databaseRoot }), projects = new AutomationStudioProjectStore(paths, undefined, authority), indexes = new AutomationStudioServiceIndexes(paths, projects, authority), flows = new AutomationStudioFlowStore(paths, flowPaths, projects, indexes, repositories, pool, authority);
  const writer = new AutomationStudioFlowWriter(paths, flowPaths, projects, indexes, flows, {} as never, {} as never, repositories, {} as never, pool, authority), creation = new AutomationStudioFlowCreation(projects, flows, repositories, writer, authority);
  const project = await new AutomationStudioProjectCreation(projects, paths, undefined, authority).createProject({ name: "Original" });
  const database = new SQLiteRepository({ rootDir: globalRoot, kind: "automation.flows", layoutVersion: 2 });
  return { root, globalRoot, databaseRoot, repositories, options, authority, pool, projects, flows, paths, flowPaths, creation, writer, project, database };
}
export async function wholeFixture(mode: "sql" | "file", run: (fixture: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  const fixture = await setup(mode);
  try { await run(fixture); }
  finally { await fixture.pool.closeAll(); const resolved = path.resolve(fixture.root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("whole-writer-")) throw new Error("Unsafe fixture cleanup"); await rm(resolved, { recursive: true, force: true }); }
}
