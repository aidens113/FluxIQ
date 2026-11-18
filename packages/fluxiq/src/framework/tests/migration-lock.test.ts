// The storage migration lock: a lock whose holder on this machine has exited
// is taken over, and of several processes taking over the same stale lock at
// once exactly one wins. Before t932 each contender removed the stale lock and
// created its own, so a slower contender removed the faster one's fresh lock
// and two or three of them went on to migrate the same root.
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { acquireMigrationLock } from "../migration-lock.ts";

const lockModule = fileURLToPath(new URL("../migration-lock.ts", import.meta.url));
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("storage migration lock", () => {
  it("takes a free lock and refuses it while its holder runs", async () => {
    const lockPath = path.join(await temporaryRoot(), "migration.lock");

    await expect(acquireMigrationLock(lockPath)).resolves.toBe(true);
    await expect(acquireMigrationLock(lockPath)).resolves.toBe(false);
    expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({ pid: process.pid, host: os.hostname() });
  });

  it("lets exactly one of two processes take over the same stale lock at the same moment", { timeout: 180_000 }, async () => {
    const root = await temporaryRoot();
    const runner = path.join(root, "contender.mjs");
    await writeFile(runner, CONTENDER, "utf8");
    for (let round = 0; round < 20; round += 1) {
      const lockPath = path.join(root, `round-${round}`, "migration.lock");
      const stale = staleClaim();
      await writeText(lockPath, stale);

      const winners = await contend(runner, lockPath, 2);

      expect(winners, `winners in round ${round}`).toBe(1);
      expect(await readFile(lockPath, "utf8")).not.toBe(stale);
      expect(await strayFiles(path.dirname(lockPath)), `files beside the lock in round ${round}`).toEqual([]);
    }
  });

  it("lets exactly one of many concurrent takeovers in one process win", async () => {
    const lockPath = path.join(await temporaryRoot(), "migration.lock");
    await writeFile(lockPath, staleClaim(), "utf8");

    const results = await Promise.all(Array.from({ length: 8 }, () => acquireMigrationLock(lockPath)));

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await strayFiles(path.dirname(lockPath))).toEqual([]);
  });

  it("takes over a stale lock past the marker of a takeover that crashed", async () => {
    const lockPath = path.join(await temporaryRoot(), "migration.lock");
    const stale = staleClaim();
    await writeFile(lockPath, stale, "utf8");
    await writeFile(takeoverMarker(lockPath, stale), staleClaim(), "utf8");

    await expect(acquireMigrationLock(lockPath)).resolves.toBe(true);

    expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({ pid: process.pid });
    expect(await strayFiles(path.dirname(lockPath))).toEqual([]);
  });

  it("clears the marker and the half-made claim a crashed attempt left, and only those", async () => {
    const root = await temporaryRoot();
    const lockPath = path.join(root, "migration.lock");
    const deadMarker = `${lockPath}.takeover-${"a".repeat(32)}`;
    await writeFile(deadMarker, staleClaim(), "utf8");
    const deadHalfMade = halfMadeClaim(lockPath, hostTag(os.hostname()), exitedProcessId());
    await writeFile(deadHalfMade, "{\"pid\":", "utf8");
    const deadNestedHalfMade = halfMadeClaim(deadMarker, hostTag(os.hostname()), exitedProcessId());
    await writeFile(deadNestedHalfMade, "", "utf8");
    const liveHalfMade = halfMadeClaim(lockPath, hostTag(os.hostname()), process.pid);
    await writeFile(liveHalfMade, "", "utf8");
    const elsewhereHalfMade = halfMadeClaim(lockPath, hostTag(`${os.hostname()}-elsewhere`), exitedProcessId());
    await writeFile(elsewhereHalfMade, "", "utf8");
    const liveMarker = `${lockPath}.takeover-${"b".repeat(32)}`;
    await writeFile(liveMarker, JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: Date.now() }), "utf8");

    await expect(acquireMigrationLock(lockPath)).resolves.toBe(true);

    expect((await strayFiles(root)).sort()).toEqual([liveHalfMade, elsewhereHalfMade, liveMarker].map((file) => path.basename(file)).sort());
  });

  it("leaves a stale lock to a takeover that is still running", async () => {
    const lockPath = path.join(await temporaryRoot(), "migration.lock");
    const stale = staleClaim();
    await writeFile(lockPath, stale, "utf8");
    await writeFile(takeoverMarker(lockPath, stale), JSON.stringify({ pid: process.pid, host: os.hostname(), startedAt: Date.now() }), "utf8");

    await expect(acquireMigrationLock(lockPath)).resolves.toBe(false);
    await expect(readFile(lockPath, "utf8")).resolves.toBe(stale);
  });

  it("refuses a lock held on another machine and one it cannot read", async () => {
    const root = await temporaryRoot();
    const elsewhere = path.join(root, "elsewhere.lock");
    await writeFile(elsewhere, JSON.stringify({ pid: exitedProcessId(), host: `${os.hostname()}-elsewhere`, startedAt: 1 }), "utf8");
    const unreadable = path.join(root, "unreadable.lock");
    await writeFile(unreadable, "", "utf8");

    await expect(acquireMigrationLock(elsewhere)).resolves.toBe(false);
    await expect(acquireMigrationLock(unreadable)).resolves.toBe(false);
  });
});

/** A contender process: reports when loaded, takes the lock when released, then stays alive (still holding what it won) until told to stop. */
const CONTENDER = `
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
const [moduleFile, lockPath, go, done] = process.argv.slice(2);
const { acquireMigrationLock } = await import(pathToFileURL(moduleFile).href);
console.log("ready");
while (!existsSync(go)) await delay(1);
console.log("won=" + await acquireMigrationLock(lockPath));
while (!existsSync(done)) await delay(5);
`;

/** Starts `count` contender processes, releases them together once all are loaded, and answers how many won. */
async function contend(runner: string, lockPath: string, count: number): Promise<number> {
  const go = `${lockPath}.go`;
  const done = `${lockPath}.done`;
  const contenders = Array.from({ length: count }, () => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", runner, lockModule, lockPath, go, done], { stdio: ["ignore", "pipe", "pipe"] });
    const output = { text: "", exited: new Promise<number | null>((resolve) => child.on("exit", resolve)) };
    child.stdout.on("data", (chunk: Buffer) => { output.text += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output.text += chunk.toString(); });
    return output;
  });
  try {
    await until(() => contenders.every((contender) => contender.text.includes("ready")), contenders);
    await writeFile(go, "", "utf8");
    await until(() => contenders.every((contender) => contender.text.includes("won=")), contenders);
    return contenders.filter((contender) => contender.text.includes("won=true")).length;
  } finally {
    await writeFile(done, "", "utf8");
    await Promise.all(contenders.map((contender) => contender.exited));
    await rm(go, { force: true });
    await rm(done, { force: true });
  }
}

async function until(condition: () => boolean, contenders: Array<{ text: string }>): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`contenders did not report: ${contenders.map((contender) => JSON.stringify(contender.text)).join(", ")}`);
    await delay(5);
  }
}

function takeoverMarker(lockPath: string, claim: string): string {
  return `${lockPath}.takeover-${createHash("sha256").update(claim).digest("hex").slice(0, 32)}`;
}

/** A claim's name while it is being written: the lock's, then the writer's machine tag, process and a random id. */
function halfMadeClaim(target: string, tag: string, pid: number): string {
  return `${target}.${tag}.${pid}.${randomUUID()}.tmp`;
}

function hostTag(host: string): string {
  return createHash("sha256").update(host).digest("hex").slice(0, 8);
}

/** A claim this machine wrote for a process that has exited. */
function staleClaim(): string {
  return JSON.stringify({ pid: exitedProcessId(), host: os.hostname(), startedAt: 1 });
}

function exitedProcessId(): number {
  return spawnSync(process.execPath, ["--version"]).pid;
}

/** Anything left beside the lock: takeover markers and half-made claims must not outlive a takeover. */
async function strayFiles(directory: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => name !== "migration.lock");
}

async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-migration-lock-"));
  roots.push(root);
  return root;
}
