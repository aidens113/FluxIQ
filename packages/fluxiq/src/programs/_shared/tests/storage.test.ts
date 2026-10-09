import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sqlite3 from "sqlite3";
import { initializeFluxIQStorage } from "../../../framework/index.ts";
import { ProgramJsonStore, ProgramStateReadError } from "../storage.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ProgramJsonStore layout-v2 transactions", () => {
  it("resolves the actual owning catalogue layout without opening or repairing storage", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-owning-layout-")); roots.push(root);
    const fluxiqRoot = path.join(root, ".fluxiq");
    await mkdir(fluxiqRoot); await writeFile(path.join(fluxiqRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    const catalogue = path.join(fluxiqRoot, "artifacts", "automation-studio", "projects", "index.json");
    const resolver = ProgramJsonStore as unknown as { existingOwningLayout(filePath: string): Promise<unknown> };
    expect(await resolver.existingOwningLayout(catalogue)).toEqual({ layoutVersion: 2, rootDir: fluxiqRoot, kind: "automation.state", documentId: "projects/index" });
    await expect(readFile(path.join(fluxiqRoot, "global.sqlite"))).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(path.join(fluxiqRoot, "config.json"), JSON.stringify({ layoutVersion: 99 }));
    await expect(resolver.existingOwningLayout(catalogue)).rejects.toThrow("program_state.owning_layout");
    await writeFile(path.join(fluxiqRoot, "config.json"), " ".repeat(8193));
    await expect(resolver.existingOwningLayout(catalogue)).rejects.toThrow("program_state.owning_config_size");
  });
  it("rolls back a multi-document Automation Studio mutation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-store-"));
    roots.push(root);
    const fluxiqRoot = path.join(root, ".fluxiq");
    await initializeFluxIQStorage(fluxiqRoot);
    const firstPath = path.join(fluxiqRoot, "artifacts", "automation-studio", "projects", "one", "manifest.json");
    const secondPath = path.join(fluxiqRoot, "artifacts", "automation-studio", "projects", "one", "workspace", "preferences.json");

    await expect(
      ProgramJsonStore.transaction(firstPath, async (transaction) => {
        await transaction.write(firstPath, { name: "one" });
        await transaction.write(secondPath, { layout: "wide" });
        throw new Error("injected failure");
      }),
    ).rejects.toThrow("injected failure");

    expect(await new ProgramJsonStore(firstPath, () => ({})).read()).toEqual({});
    expect(await new ProgramJsonStore(secondPath, () => ({})).read()).toEqual({});

    await ProgramJsonStore.transaction(firstPath, async (transaction) => {
      await transaction.write(firstPath, { name: "one" });
      await transaction.write(secondPath, { layout: "wide" });
    });
    expect(await new ProgramJsonStore(firstPath, () => ({})).read()).toEqual({ name: "one" });
    expect(await new ProgramJsonStore(secondPath, () => ({})).read()).toEqual({ layout: "wide" });
  });
});

describe("ProgramJsonStore malformed legacy state", () => {
  it("distinguishes missing files from corrupt state and preserves a recovery backup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-json-recovery-"));
    roots.push(root);
    const filePath = path.join(root, "programs", "state.json");
    const store = new ProgramJsonStore(filePath, () => ({ items: [] }));

    await expect(store.read()).resolves.toEqual({ items: [] });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{not-json", "utf8");

    await expect(store.read()).rejects.toMatchObject({
      name: "ProgramStateReadError",
      code: "program_state.invalid",
      filePath,
      fileRecoveryAvailable: true,
    } satisfies Partial<ProgramStateReadError>);

    const recovered = await store.recoverMalformedState(1_000);
    expect(await readFile(recovered.backupPath, "utf8")).toBe("{not-json");
    await expect(store.read()).resolves.toEqual({ items: [] });
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ version: 1, data: { items: [] } });
  });

  it("rejects structurally invalid envelopes instead of silently resetting them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-json-envelope-"));
    roots.push(root);
    const filePath = path.join(root, "state.json");
    await writeFile(filePath, JSON.stringify({ version: 1, data: [] }), "utf8");

    await expect(new ProgramJsonStore(filePath, () => ({ items: [] })).read()).rejects.toBeInstanceOf(ProgramStateReadError);
  });
});

describe("ProgramJsonStore existing read-only state", () => {
  it("refuses oversized file observations before returning their contents", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-existing-large-")); roots.push(root);
    const filePath = path.join(root, "state.json"); await writeFile(filePath, JSON.stringify({ version: 1, data: { large: "a".repeat(4 * 1024 * 1024) } }));
    await expect(new ProgramJsonStore(filePath, () => ({})).readExistingReadOnly()).rejects.toThrow("observation_size");
  });
  it("does not synthesize empty state or create absent files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-existing-")); roots.push(root);
    const filePath = path.join(root, "absent", "state.json");
    await expect(new ProgramJsonStore(filePath, () => ({ manufactured: true })).readExistingReadOnly()).resolves.toBeNull();
    await expect(readFile(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses malformed or unsupported owning layout instead of using stale files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-existing-layout-")); roots.push(root);
    const filePath = path.join(root, "artifacts", "automation-studio", "projects", "index.json");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ version: 1, data: { projects: [{ id: "stale" }] } }));
    const store = new ProgramJsonStore(filePath, () => ({}));
    await writeFile(path.join(root, "config.json"), "{broken");
    await expect(store.readExistingReadOnly()).rejects.toThrow();
    await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 99 }));
    await expect(store.readExistingReadOnly()).rejects.toThrow();
  });
  it("reads real initialized layout-v2 data without file fallback", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-existing-sql-")); roots.push(root);
    await initializeFluxIQStorage(root);
    const filePath = path.join(root, "artifacts", "automation-studio", "projects", "index.json");
    const store = new ProgramJsonStore(filePath, () => ({}));
    await store.write({ projects: [{ id: "real" }] });
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(path.join(root, "global.sqlite"));
      db.exec("pragma journal_mode=DELETE", error => db.close(closeError => error || closeError ? reject(error ?? closeError) : resolve()));
    });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ version: 1, data: { projects: [{ id: "stale" }] } }));
    await expect(store.readExistingReadOnly()).resolves.toEqual({ projects: [{ id: "real" }] });
  });
});

describe("ProgramJsonStore directory reads in layout v2", () => {
  async function insertMalformed(root: string, id: string) {
    await new Promise<void>((resolve, reject) => {
      const db = new sqlite3.Database(path.join(root, "global.sqlite"));
      db.run(`insert into "automation.state" (id, kind, data, created_at_ms, updated_at_ms) values (?, 'program.state', ?, 0, 0)`, [id, `{not json ${"x".repeat(1024 * 1024)}`], error => db.close(closeError => error || closeError ? reject(error ?? closeError) : resolve()));
    });
  }
  async function layout() {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-program-directory-")); roots.push(root);
    await initializeFluxIQStorage(root);
    const project = path.join(root, "artifacts", "automation-studio", "projects", "one");
    for (const relative of ["flows/a/flow.json", "flows/b/flow.json", "flows/a/candidate-draft.json", "flows/a/nested/x/flow.json", "flows-old/c/flow.json", "manifest.json"]) {
      await new ProgramJsonStore(path.join(project, relative), () => ({})).write({ relative });
    }
    // A large unrelated run session that no Flow listing needs; it is malformed, so reading it would throw.
    await insertMalformed(root, "projects/one/runtime/sessions/trial.big");
    await insertMalformed(root, "projects/two/flows/z/flow");
    return { root, project };
  }

  it("lists a directory's documents without reading any other row", async () => {
    const { project } = await layout();
    const documents = await ProgramJsonStore.listDirectoryDocuments(path.join(project, "flows"), "flow.json");
    expect(documents).toEqual([{ relative: "flows/a/flow.json" }, { relative: "flows/b/flow.json" }]);
    expect(await ProgramJsonStore.listDirectoryDocuments(path.join(project, "tasks"), "task.json")).toEqual([]);
  });

  it("deletes a directory's rows without reading any row's data", async () => {
    const { root, project } = await layout();
    expect(await ProgramJsonStore.deletePath(path.join(project, "flows"))).toBe(true);
    expect(await ProgramJsonStore.listDirectoryDocuments(path.join(project, "flows"), "flow.json")).toEqual([]);
    expect(await new ProgramJsonStore(path.join(project, "flows", "a", "candidate-draft.json"), () => ({ absent: true })).read()).toEqual({ absent: true });
    expect(await ProgramJsonStore.listDirectoryDocuments(path.join(project, "flows-old"), "flow.json")).toEqual([{ relative: "flows-old/c/flow.json" }]);
    expect(await new ProgramJsonStore(path.join(project, "manifest.json"), () => ({})).read()).toEqual({ relative: "manifest.json" });
    expect(await ProgramJsonStore.deletePath(path.join(project, "flows"))).toBe(false);
    // The malformed unrelated row survives, untouched.
    const ids = await new Promise<string[]>((resolve, reject) => {
      const db = new sqlite3.Database(path.join(root, "global.sqlite"));
      db.all(`select id from "automation.state" where id like 'projects/%/flows/z/%' or id like '%trial.big'`, (error, rows: Array<{ id: string }>) => db.close(() => error ? reject(error) : resolve(rows.map(row => row.id).sort())));
    });
    expect(ids).toEqual(["projects/one/runtime/sessions/trial.big", "projects/two/flows/z/flow"]);
  });
});
