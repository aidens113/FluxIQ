import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import sqlite3 from "sqlite3";
import { SQLiteRepository, createRecord } from "../sqlite-repository.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), "fluxiq-readonly-")); roots.push(value); return value; }
async function deleteJournal(directory: string) {
  await new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(path.join(directory, "global.sqlite"));
    db.exec("pragma journal_mode=DELETE", error => db.close(closeError => error || closeError ? reject(error ?? closeError) : resolve()));
  });
}

it("refuses absent SQLite storage without creating directories or databases", async () => {
  const directory = await root();
  const repository = new SQLiteRepository({ rootDir: path.join(directory, "absent"), kind: "automation.state", layoutVersion: 2 });
  await expect(repository.getExistingReadOnly("projects/index")).resolves.toBeNull();
  expect(await readdir(directory)).toEqual([]);
});

it("reads actual existing records and leaves bytes/schema unchanged", async () => {
  const directory = await root();
  const repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  await repository.put(createRecord({ id: "projects/index", kind: repository.kind, data: { projects: [{ id: "one" }] } }));
  await deleteJournal(directory);
  const before = await readFile(path.join(directory, "global.sqlite"));
  expect((await repository.getExistingReadOnly("projects/index"))?.data).toEqual({ projects: [{ id: "one" }] });
  await expect(repository.getExistingReadOnly("absent")).resolves.toBeNull();
  expect(await readFile(path.join(directory, "global.sqlite"))).toEqual(before);
  expect(await readdir(directory)).toEqual(["global.sqlite"]);
});

it("refuses an uninitialized table without installing it", async () => {
  const directory = await root();
  const initialized = new SQLiteRepository({ rootDir: directory, kind: "other", layoutVersion: 2 });
  await initialized.put(createRecord({ id: "one", kind: "other", data: {} }));
  await deleteJournal(directory);
  const before = await readFile(path.join(directory, "global.sqlite"));
  await expect(new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 }).getExistingReadOnly("one")).rejects.toThrow();
  expect(await readFile(path.join(directory, "global.sqlite"))).toEqual(before);
});

it("refuses persisted WAL mode before SQLite can create sidecars", async () => {
  const directory = await root(); const repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  await repository.put(createRecord({ id: "one", kind: repository.kind, data: {} }));
  const before = await readFile(path.join(directory, "global.sqlite"));
  await expect(repository.getExistingReadOnly("one")).rejects.toThrow("readonly_journal_unsupported");
  expect(await readdir(directory)).toEqual(["global.sqlite"]);
  expect(await readFile(path.join(directory, "global.sqlite"))).toEqual(before);
});

it("returns a bounded ordered batch from one existing readonly transaction", async () => {
  const directory = await root(), repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  await repository.put(createRecord({ id: "index", kind: repository.kind, data: { projects: [{ id: "original" }] } }));
  await repository.put(createRecord({ id: "manifest", kind: repository.kind, data: { id: "original" } })); await deleteJournal(directory);
  const before = await readFile(path.join(directory, "global.sqlite"));
  const rows = await repository.getExistingReadOnlyMany(["manifest", "absent", "index"]);
  expect(rows.map(record => record?.data ?? null)).toEqual([{ id: "original" }, null, { projects: [{ id: "original" }] }]);
  expect(await readFile(path.join(directory, "global.sqlite"))).toEqual(before); expect(await readdir(directory)).toEqual(["global.sqlite"]);
});
it("refuses an oversized SQL row through bounded projection before materializing JSON", async () => {
  const directory = await root(), repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  await repository.put(createRecord({ id: "oversize", kind: repository.kind, data: { large: "a".repeat(4 * 1024 * 1024) } })); await deleteJournal(directory);
  await expect(repository.getExistingReadOnly("oversize")).rejects.toThrow("observation_size");
});
