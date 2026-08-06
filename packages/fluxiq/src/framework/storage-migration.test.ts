import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository, createRecord } from "../programs/database-manager/storage/sqlite-repository.ts";
import { FluxIQ } from "./index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeWithRetry));
});

describe("FluxIQ storage layout migration", () => {
  it("migrates unscoped global state and keeps importer domain naming separate from storage ownership", async () => {
    const root = await temporaryRoot();
    const fluxiqRoot = path.join(root, ".fluxiq");
    const programFile = path.join(fluxiqRoot, "data", "programs", "deployment-sync", "state.json");
    await mkdir(path.dirname(programFile), { recursive: true });
    await writeFile(programFile, JSON.stringify({ version: 1, data: { targets: [{ id: "target.1" }], artifacts: [], runs: [] } }), "utf8");
    const projectsFile = path.join(fluxiqRoot, "data", "programs", "automation-studio", "projects.json");
    await mkdir(path.dirname(projectsFile), { recursive: true });
    await writeFile(projectsFile, JSON.stringify({ version: 1, data: {
      categories: [],
      projects: [{ id: "project.legacy", name: "Legacy importer project", description: "", categoryId: null, createdAt: 1, updatedAt: 1, customHierarchyNodes: [], deletedHierarchyIds: [], workspacePrefs: {} }]
    } }), "utf8");
    const repository = new SQLiteRepository({ rootDir: path.join(fluxiqRoot, "databases"), kind: "identity.users" });
    await repository.put(createRecord({ id: "user:admin", kind: "identity.users", data: { username: "admin" } }));

    const legacy = FluxIQ.create({ rootDir: root, domainId: "Importer Domain", loadEnv: false });
    expect(legacy.inspectStorage().layout).toBe("v1");
    const result = await legacy.migrateStorage();

    await expect(stat(result.archiveRoot)).resolves.toBeTruthy();
    const config = JSON.parse(await readFile(path.join(fluxiqRoot, "config.json"), "utf8")) as { layoutVersion: number };
    expect(config.layoutVersion).toBe(2);
    const migratedPrograms = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "program.state", layoutVersion: 2 });
    expect((await migratedPrograms.get("deployment-sync/state"))?.data).toMatchObject({ targets: [{ id: "target.1" }] });
    const migratedIdentity = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "identity.users", layoutVersion: 2 });
    expect((await migratedIdentity.get("user:admin"))?.data).toMatchObject({ username: "admin" });

    const reopened = FluxIQ.create({ rootDir: root, domainId: "Importer Domain", loadEnv: false });
    expect(reopened.paths.databases).toBe(fluxiqRoot);
    expect(reopened.paths.domainRoot).toBe(path.join(fluxiqRoot, "domains", "importer_domain"));
    expect(reopened.paths.domainPrograms).toBe(path.join(root, "domains", "importer_domain", "programs"));
    expect((await reopened.programs.automationStudio.listProjects()).projects).toContainEqual(expect.objectContaining({ id: "project.legacy" }));
  });

  it("stops divergent scoped/global collisions before archiving sources", async () => {
    const root = await temporaryRoot();
    const fluxiqRoot = path.join(root, ".fluxiq");
    await writeProgramState(path.join(fluxiqRoot, "data"), { value: "global" });
    await writeProgramState(path.join(fluxiqRoot, "example", "data"), { value: "scoped" });
    const fluxiq = FluxIQ.create({ rootDir: root, domainId: "example", loadEnv: false });

    await expect(fluxiq.migrateStorage()).rejects.toThrow("Divergent program-state collision");
    await expect(stat(path.join(fluxiqRoot, "data", "programs", "compute-control", "state.json"))).resolves.toBeTruthy();
    await expect(stat(path.join(fluxiqRoot, "example", "data", "programs", "compute-control", "state.json"))).resolves.toBeTruthy();
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-storage-v2-"));
  roots.push(root);
  return root;
}

async function writeProgramState(dataRoot: string, data: Record<string, unknown>): Promise<void> {
  const filePath = path.join(dataRoot, "programs", "compute-control", "state.json");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ version: 1, data }), "utf8");
}

async function removeWithRetry(root: string): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await delay(20 * (attempt + 1));
    }
  }
}
