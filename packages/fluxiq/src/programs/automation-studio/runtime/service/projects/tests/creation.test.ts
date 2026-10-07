import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../../_shared/storage.ts";
import { SQLiteRepository } from "../../../../../database-manager/index.ts";
import { CanonicalAuthorityWholeOperation } from "../../../../storage/canonical-authority/index.ts";
import { createCanonicalAutomationStudioSQLiteRepositories } from "../../../../storage/index.ts";
import { AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectCreation, AutomationStudioProjectStore } from "../index.ts";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) { if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("whole-project-")) throw new Error("Unsafe fixture cleanup"); await rm(root, { recursive: true, force: true }); } });
async function fixture(mode: "sql" | "file", catalogue = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "whole-project-")); roots.push(root);
  const globalRoot = path.join(root, ".fluxiq"), databaseRoot = mode === "sql" ? path.join(globalRoot, "artifacts", "automation-studio") : path.join(root, "automation");
  await mkdir(globalRoot); if (mode === "sql") await writeFile(path.join(globalRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projectRoot = path.join(databaseRoot, "projects"), paths = new AutomationStudioProjectPaths(projectRoot), store = new AutomationStudioProjectStore(paths);
  if (catalogue) await new ProgramJsonStore(path.join(projectRoot, "index.json"), () => ({})).write({ categories: [], projects: [] });
  const authority = await CanonicalAuthorityWholeOperation.fromFactory(createCanonicalAutomationStudioSQLiteRepositories(globalRoot), { projectRootDir: projectRoot, projectDatabaseRootDir: databaseRoot });
  return { root, globalRoot, projectRoot, authority, creation: new AutomationStudioProjectCreation(store, paths, undefined, authority), database: new SQLiteRepository({ rootDir: globalRoot, kind: "automation.flows", layoutVersion: 2 }) };
}
describe("actual original project creation ingress", () => {
  for (const mode of ["sql", "file"] as const) it(`creates a generated original project through real ${mode} catalogue effects before completing both participants`, async () => {
    const { creation, database, projectRoot } = await fixture(mode);
    const project = await creation.createProject({ name: "Original", domainId: "example" });
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    const index = await new ProgramJsonStore<JsonObject>(path.join(projectRoot, "index.json"), () => ({})).read(); expect(index.projects).toEqual([project]);
    expect(await new ProgramJsonStore(path.join(projectRoot, project.id, "manifest.json"), () => ({})).read()).toEqual(project);
    const state = await database.transaction({}, sql => sql.get<{ status: string; phase: string; pending_operation_key: string | null }>("select l.status,l.pending_operation_key,o.phase from canonical_authority_lifecycle l join canonical_authority_operations o on o.original_project_id=l.original_project_id where l.original_project_id=?", [project.id]));
    expect(state).toMatchObject({ status: "active", phase: "completed", pending_operation_key: null });
  });
  it("refuses a missing existing catalogue without initialization and preserves the admitted claim", async () => {
    const { creation, database, projectRoot } = await fixture("sql", false);
    await expect(creation.createProject({ name: "No repair" })).rejects.toThrow("canonical_whole.catalogue_table_missing");
    const state = await database.transaction({}, sql => sql.get<{ status: string; phase: string }>("select l.status,o.phase from canonical_authority_lifecycle l join canonical_authority_operations o on o.original_project_id=l.original_project_id"));
    expect(state).toMatchObject({ status: "creating", phase: "unknown" });
    await expect(readFile(path.join(projectRoot, "index.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not certify a callback that performs none of the required actual effects", async () => {
    const { authority, database } = await fixture("file");
    await expect(authority.createProject({ name: "False success" }, async () => "done")).rejects.toThrow("canonical_whole.incomplete_effects");
    expect(await database.transaction({}, sql => sql.get("select operation_key from canonical_authority_operations where phase='unknown'"))).toBeDefined();
  });
});
