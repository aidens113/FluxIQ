// @fluxiq-test-group real-sql
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SQLiteRepository, createRecord } from "../../../../framework/persistence/repository/sqlite-repository.ts";
import { currentProcessIdentity, fluxIQDataRootOwnerFile, processStartTime, type FluxIQDataRootOwner } from "../../../data-root-owner/index.ts";
import { parseStorageArguments, runStorageCommand } from "../index.ts";

// `fluxiq storage` on a real data directory: a layout v1 fixture is migrated
// offline, and nothing runs while a live server holds the directory.

let root: string;
let server: ChildProcess | null = null;

beforeEach(async () => {
  vi.stubEnv("FLUXIQ_HOST_MODULE", "");
  root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-storage-command-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server.kill("SIGKILL");
    await exited;
  }
  server = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rm(root, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await delay(20 * (attempt + 1));
    }
  }
});

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { stdout: (text: string) => void out.push(text), stderr: (text: string) => void err.push(text) } };
}

/** A data directory in storage layout v1: a program's JSON state under data/, and the identity users in databases/. */
async function v1Root(): Promise<void> {
  const fluxiqRoot = path.join(root, ".fluxiq");
  const programFile = path.join(fluxiqRoot, "data", "programs", "deployment-sync", "state.json");
  await mkdir(path.dirname(programFile), { recursive: true });
  await writeFile(programFile, JSON.stringify({ version: 1, data: { targets: [{ id: "target.1" }], artifacts: [], runs: [] } }), "utf8");
  const users = new SQLiteRepository({ rootDir: path.join(fluxiqRoot, "databases"), kind: "identity.users" });
  await users.put(createRecord({ id: "user:admin", kind: "identity.users", data: { username: "admin" } }));
}

/** A live process recorded as the web panel serving the directory, as the panel records itself. */
async function liveServerHoldsRoot(): Promise<number> {
  server = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)"], { stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    server!.once("spawn", () => resolve());
    server!.once("error", reject);
  });
  const self = await currentProcessIdentity();
  const pid = server.pid!;
  const startedAt = await processStartTime(pid);
  if (startedAt.kind !== "read") throw new Error(startedAt.reason);
  const owner: FluxIQDataRootOwner = {
    kind: "fluxiq.data-root-owner", version: 1, token: "panel-token", role: "the web panel", claimedAt: new Date().toISOString(),
    pid, startedAt: startedAt.value, platform: self.platform, machine: self.machine, hostname: self.hostname
  };
  await writeFile(fluxIQDataRootOwnerFile(root), JSON.stringify(owner), "utf8");
  return pid;
}

describe("fluxiq storage", () => {
  it("migrates a layout v1 data directory offline, then gives the directory up", async () => {
    await v1Root();
    const inspected = io();
    expect(await runStorageCommand(["inspect", "--data-dir", root], inspected.io)).toBe(0);
    expect(JSON.parse(inspected.out.join(""))).toMatchObject({ layout: "v1", migrationRequired: true });

    const migrated = io();
    expect(await runStorageCommand(["migrate", "--data-dir", root], migrated.io), migrated.err.join("")).toBe(0);
    const result = JSON.parse(migrated.out.join("")) as { archiveRoot: string; importedProgramDocuments: number };
    expect(existsSync(result.archiveRoot)).toBe(true);
    expect(result.importedProgramDocuments).toBeGreaterThan(0);
    const config = JSON.parse(await readFile(path.join(root, ".fluxiq", "config.json"), "utf8")) as { layoutVersion: number };
    expect(config.layoutVersion).toBe(2);
    const programs = new SQLiteRepository({ rootDir: path.join(root, ".fluxiq"), kind: "program.state", layoutVersion: 2 });
    expect((await programs.get("deployment-sync/state"))?.data).toMatchObject({ targets: [{ id: "target.1" }] });
    // The claim is given up once the instance is closed, so a server can start.
    expect(existsSync(fluxIQDataRootOwnerFile(root))).toBe(false);

    const after = io();
    expect(await runStorageCommand(["inspect", "--data-dir", root], after.io)).toBe(0);
    expect(JSON.parse(after.out.join(""))).toMatchObject({ layout: "v2", migrationRequired: false });
    // A finished migration leaves no journal, so there is nothing to roll back.
    const rollback = io();
    expect(await runStorageCommand(["rollback", "--data-dir", root], rollback.io)).toBe(0);
    expect(JSON.parse(rollback.out.join(""))).toEqual({ rolledBack: false, restoredRoots: [] });
  });

  it("is refused while a live server holds the data directory, and changes nothing", async () => {
    await v1Root();
    const pid = await liveServerHoldsRoot();
    for (const action of ["migrate", "setup", "rollback", "inspect"]) {
      const refused = io();
      expect(await runStorageCommand([action, "--data-dir", root], refused.io)).toBe(1);
      expect(refused.out).toEqual([]);
      const message = refused.err.join("");
      expect(message).toContain(`Cannot start fluxiq storage: the FluxIQ data at ${path.resolve(root)} is already being served by the web panel (process ${pid}`);
      expect(message).toContain("runs only while no server serves them");
    }
    expect(existsSync(path.join(root, ".fluxiq", "config.json"))).toBe(false);
    expect(existsSync(path.join(root, ".fluxiq", "data", "programs", "deployment-sync", "state.json"))).toBe(true);
    // The server's own claim is left as it was.
    expect(JSON.parse(await readFile(fluxIQDataRootOwnerFile(root), "utf8"))).toMatchObject({ token: "panel-token", pid });
  });

  it("refuses an action on a directory that does not exist, without creating it", async () => {
    const missing = path.join(root, "nowhere");
    const refused = io();
    expect(await runStorageCommand(["migrate", "--data-dir", missing], refused.io)).toBe(1);
    expect(refused.err.join("")).toContain(`There is no FluxIQ data directory at ${missing}`);
    expect(existsSync(missing)).toBe(false);
  });

  it("answers usage with exit 2", async () => {
    const usage = io();
    expect(await runStorageCommand(["upgrade"], usage.io)).toBe(2);
    expect(usage.err.join("")).toContain("Unknown storage action: upgrade");
    expect(await runStorageCommand(["migrate", "--data-dir"], io().io)).toBe(2);
  });
});

describe("fluxiq storage arguments", () => {
  const home = path.resolve("/home/person");

  it("takes --data-dir, else FLUXIQ_ROOT, else ~/.fluxiq/data", () => {
    expect(parseStorageArguments(["inspect", "--data-dir=./x"], {}, home)).toEqual({ ok: true, value: { action: "inspect", dataDir: path.resolve("./x") } });
    expect(parseStorageArguments(["setup"], { FLUXIQ_ROOT: "/srv/fluxiq" }, home)).toEqual({ ok: true, value: { action: "setup", dataDir: path.resolve("/srv/fluxiq") } });
    expect(parseStorageArguments(["migrate"], {}, home)).toEqual({ ok: true, value: { action: "migrate", dataDir: path.join(home, ".fluxiq", "data") } });
  });

  it("refuses a missing action, an unknown flag and a repeated directory", () => {
    expect(parseStorageArguments([], {}, home).ok).toBe(false);
    expect(parseStorageArguments(["inspect", "--port", "1"], {}, home)).toEqual({ ok: false, error: "Unknown argument: --port" });
    expect(parseStorageArguments(["inspect", "--data-dir", "a", "--data-dir", "b"], {}, home)).toEqual({ ok: false, error: "--data-dir may be given once." });
  });
});
