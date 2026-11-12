// @fluxiq-test-group real-sql
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import sqlite3 from "sqlite3";
import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../storage.ts";
import { programJsonDocumentTransaction } from "../transaction.ts";

vi.setConfig({ testTimeout: 30_000 });
const folders: string[] = [];
const children: { child: ChildProcessWithoutNullStreams; ended: Promise<number | null> }[] = [];
afterEach(async () => {
  for (const { child } of children) if (child.exitCode === null) child.kill();
  await Promise.all(children.splice(0).map(({ ended }) => ended));
  for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function fixture(layout: "legacy" | "v2") {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-document-transaction-"));
  folders.push(root);
  if (layout === "v2") await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const folder = layout === "v2" ? path.join(root, "artifacts", "automation-studio", "projects", "one", "task-memory") : path.join(root, "one", "task-memory");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "task.json");
  await programJsonDocumentTransaction(file, async (document) => await document.write({ actsByScope: {}, pipelineSourcesByScope: {} }));
  const database = layout === "v2" ? path.join(root, "global.sqlite") : path.join(folder, ".document-locks", "task.json.lock", "global.sqlite");
  return { root, folder, file, database };
}

/** Observe a native writer lock directly; never infer blocking from an event that has not arrived. */
async function writerIsHeld(file: string): Promise<boolean> {
  const database = new sqlite3.Database(file);
  database.configure("busyTimeout", 0);
  try {
    return await new Promise<boolean>((resolve, reject) => {
      database.run("begin immediate", (error: Error & { code?: string } | null) => {
        if (error?.code === "SQLITE_BUSY") resolve(true);
        else if (error) reject(error);
        else database.run("rollback", (rollbackError) => rollbackError ? reject(rollbackError) : resolve(false));
      });
    });
  } finally {
    await new Promise<void>((resolve, reject) => database.close((error) => error ? reject(error) : resolve()));
  }
}

function writer(file: string, scope: string, hold = false) {
  const child = spawn(process.execPath, ["--experimental-transform-types", fileURLToPath(new URL("./process-writer.ts", import.meta.url)), file, scope, hold ? "hold" : "write", process.env["FLUXIQ_TEST_DOCUMENT_WITHOUT_LOCK"] === "1" ? "unlocked" : "locked"], { windowsHide: true });
  const ended = new Promise<number | null>((resolve) => child.once("exit", resolve));
  children.push({ child, ended });
  const observed = new Set<string>();
  const waits = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  let output = "";
  let errors = "";
  let terminal: Error | undefined;
  child.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    const lines = output.split("\n");
    output = lines.pop() ?? "";
    for (const line of lines) {
      observed.add(line.trim());
      waits.get(line.trim())?.resolve();
      waits.delete(line.trim());
    }
  });
  const fail = (error: Error) => {
    terminal ??= error;
    for (const waiter of waits.values()) waiter.reject(error);
    waits.clear();
  };
  child.once("error", fail);
  child.once("exit", (code) => fail(new Error(`Document writer exited ${code}: ${errors}`)));
  const until = (line: string) => observed.has(line) ? Promise.resolve() : terminal ? Promise.reject(terminal) : new Promise<void>((resolve, reject) => { waits.set(line, { resolve, reject }); });
  return { child, ended, until, observed, send: (line: string) => child.stdin.write(`${line}\n`) };
}

describe.each(["legacy", "v2"] as const)("%s document transaction ownership", (layout) => {
  it("serializes two independent processes and preserves both act and source-reference entries", async () => {
    const lane = await fixture(layout);
    const first = writer(lane.file, "first", true);
    await first.until("ready");
    first.send("start");
    await first.until("entered");
    expect(await writerIsHeld(lane.database)).toBe(true);
    const second = writer(lane.file, "second");
    await second.until("ready");
    second.send("start");
    await second.until("starting");
    first.send("commit");
    await Promise.all([first.until("done"), second.until("done")]);
    expect(await Promise.all([first.ended, second.ended])).toEqual([0, 0]);
    const kept = await new ProgramJsonStore<JsonObject>(lane.file, () => ({})).read();
    expect(Object.keys(kept["actsByScope"] as object).sort()).toEqual(["first", "second"]);
    expect(Object.keys(kept["pipelineSourcesByScope"] as object).sort()).toEqual(["first", "second"]);
  });

  it("releases a crashed process's transaction for the waiting writer", async () => {
    const lane = await fixture(layout);
    const first = writer(lane.file, "crashed", true);
    await first.until("ready");
    first.send("start");
    await first.until("entered");
    const second = writer(lane.file, "survivor");
    await second.until("ready");
    second.send("start");
    await second.until("starting");
    first.child.kill();
    await first.ended;
    await second.until("done");
    expect(await second.ended).toBe(0);
    expect(await new ProgramJsonStore(lane.file, () => ({})).read()).toMatchObject({ actsByScope: { survivor: { state: "landed" } } });
  });
});

it("keeps legacy documents independent and guard databases free of document data", async () => {
  const lane = await fixture("legacy");
  const held = writer(lane.file, "held", true);
  await held.until("ready");
  held.send("start");
  await held.until("entered");
  const other = path.join(lane.folder, "other.json");
  await programJsonDocumentTransaction(other, async (document) => await document.write({ note: "other document" }));
  expect(await new ProgramJsonStore(other, () => ({})).read()).toEqual({ note: "other document" });
  held.send("commit");
  await held.until("done");
  expect(await held.ended).toBe(0);
  expect(await readdir(path.join(lane.folder, ".document-locks"))).toEqual(expect.arrayContaining(["task.json.lock", "other.json.lock"]));
  const { SQLiteRepository } = await import("../../../repository/sqlite-repository.ts");
  expect(await new SQLiteRepository({ rootDir: path.join(lane.folder, ".document-locks", "task.json.lock"), kind: "program.document_lock" }).list()).toEqual([]);
});

it("propagates a genuine document failure without manufacturing an empty replacement", async () => {
  const lane = await fixture("legacy");
  await writeFile(lane.file, "malformed");
  await expect(programJsonDocumentTransaction(lane.file, async (document) => {
    const prior = await document.read();
    await document.write({ ...prior, new: true });
  })).rejects.toThrow("Program state is malformed");
});

it("rejects a child wait registered after that writer already exited with an error", async () => {
  const lane = await fixture("legacy");
  await writeFile(lane.file, "malformed");
  const failing = writer(lane.file, "broken");
  await failing.until("ready");
  failing.send("start");
  expect(await failing.ended).not.toBe(0);
  await expect(failing.until("done")).rejects.toThrow("Document writer exited");
});
