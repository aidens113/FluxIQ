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

async function insertRaw(directory: string, kind: string, id: string, data: string) {
  await new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(path.join(directory, "global.sqlite"));
    db.run(`insert into "${kind}" (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, 0, 0)`, [id, kind, data], error => db.close(closeError => error || closeError ? reject(error ?? closeError) : resolve()));
  });
}

it("lists by id prefix without reading rows outside the prefix or rows the selector refuses", async () => {
  const directory = await root(), repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  for (const id of ["projects/p/flows/a/flow", "projects/p/flows/a/candidate-draft", "projects/p/flows/b/flow", "projects/p/flows/%_/flow", "projects/p/flows/é/flow"]) {
    await repository.put(createRecord({ id, kind: repository.kind, data: { id } }));
  }
  // Malformed JSON: a whole-table read (or a read of an unselected row) would throw while parsing it.
  for (const id of ["projects/p/flows", "projects/p/flows0", "projects/p/flowsX/a/flow", "projects/p/runtime/sessions/trial.big", "projects/q/flows/a/flow", "projects/p/flows/a/huge"]) {
    await insertRaw(directory, repository.kind, id, "{not json");
  }
  await expect(repository.list()).rejects.toThrow();
  const records = await repository.listByIdPrefix("projects/p/flows/", { select: id => !id.endsWith("/huge") });
  expect(records.map(record => record.id)).toEqual(["projects/p/flows/%_/flow", "projects/p/flows/a/candidate-draft", "projects/p/flows/a/flow", "projects/p/flows/b/flow", "projects/p/flows/é/flow"]);
  expect(records.map(record => record.data)).toEqual(records.map(record => ({ id: record.id })));
  // Ids come from the index alone, so a malformed row inside the prefix is still named, never parsed.
  expect(await repository.listIdsByPrefix("projects/p/flows/a/")).toEqual(["projects/p/flows/a/candidate-draft", "projects/p/flows/a/flow", "projects/p/flows/a/huge"]);
  await expect(repository.listByIdPrefix("projects/p/flows/a/")).rejects.toThrow();
  // LIKE wildcards in a prefix are literal, and a prefix ending in a non-ASCII character still bounds its range.
  expect((await repository.listByIdPrefix("projects/p/flows/%")).map(record => record.id)).toEqual(["projects/p/flows/%_/flow"]);
  expect((await repository.listByIdPrefix("projects/p/flows/é")).map(record => record.id)).toEqual(["projects/p/flows/é/flow"]);
  expect(await repository.listByIdPrefix("projects/none/")).toEqual([]);
});

it("lists more prefixed rows than one parameter batch holds", async () => {
  const directory = await root(), repository = new SQLiteRepository({ rootDir: directory, kind: "automation.state", layoutVersion: 2 });
  const ids = Array.from({ length: 450 }, (_, index) => `dir/${String(index).padStart(4, "0")}/doc`);
  await repository.transaction({}, async (transaction) => {
    for (const id of ids) await transaction.run(`insert into "automation.state" (id, kind, data, created_at_ms, updated_at_ms) values (?, ?, ?, 0, 0)`, [id, repository.kind, JSON.stringify({ id })]);
  });
  const records = await repository.listByIdPrefix("dir/");
  expect(records.map(record => record.id)).toEqual(ids);
  expect(records.every(record => (record.data as { id: string }).id === record.id)).toBe(true);
});
