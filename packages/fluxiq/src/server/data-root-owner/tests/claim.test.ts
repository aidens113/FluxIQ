import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimFluxIQDataRoot,
  currentProcessIdentity,
  FluxIQDataRootHeldError,
  fluxIQDataRootOwnerFile,
  processStartTime,
  type FluxIQDataRootOwner,
  type ProcessIdentity
} from "../index.ts";

const claimModule = pathToFileURL(fileURLToPath(new URL("../claim.ts", import.meta.url))).href;
let root: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fluxiq-data-root-owner-"));
});

afterEach(async () => {
  for (const child of children.splice(0)) await stop(child);
  await rm(root, { recursive: true, force: true });
});

/** A second process that claims the root with the real module and holds it until killed. */
async function holdInAnotherProcess(role: string): Promise<ChildProcess> {
  const script = `const { claimFluxIQDataRoot } = await import(${JSON.stringify(claimModule)});
await claimFluxIQDataRoot(${JSON.stringify(root)}, { role: ${JSON.stringify(role)} });
process.stdout.write("held\\n");
setInterval(() => {}, 60_000);`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    let errors = "";
    child.stderr?.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
    child.stdout?.on("data", (chunk: Buffer) => { if (chunk.toString().includes("held")) resolve(); });
    child.once("exit", (code) => reject(new Error(`holder exited (${code}): ${errors}`)));
  });
  return child;
}

/** A process that is merely alive, for owner records written by the test. */
async function aliveProcess(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 60_000)"], { stdio: "ignore" });
  children.push(child);
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", reject);
  });
  return child;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // A hard kill: the holder gets no chance to remove its owner file, as in a crash.
  child.kill("SIGKILL");
  await exited;
}

async function writeOwner(fields: Partial<FluxIQDataRootOwner> & { pid: number }): Promise<FluxIQDataRootOwner> {
  const self = await currentProcessIdentity();
  const owner: FluxIQDataRootOwner = {
    kind: "fluxiq.data-root-owner", version: 1, token: "recorded-token", role: "the web panel", claimedAt: "2026-11-17T10:00:00.000Z",
    startedAt: null, platform: self.platform, machine: self.machine, hostname: self.hostname, ...fields
  };
  await writeFile(fluxIQDataRootOwnerFile(root), JSON.stringify(owner), "utf8");
  return owner;
}

async function startTimeOf(pid: number): Promise<string> {
  const time = await processStartTime(pid);
  if (time.kind !== "read") throw new Error(`could not read the start time of ${pid}: ${time.reason}`);
  return time.value;
}

async function refusal(promise: Promise<unknown>): Promise<FluxIQDataRootHeldError> {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(FluxIQDataRootHeldError);
  return error as FluxIQDataRootHeldError;
}

describe("claimFluxIQDataRoot", () => {
  it("refuses a second server while another process holds the root, naming the holder", async () => {
    const holder = await holdInAnotherProcess("the web panel");
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev" }));
    expect(error.holder.kind).toBe("live");
    expect(error.message).toContain(`Cannot start fluxiq dev: the FluxIQ data at ${root} is already being served by the web panel (process ${holder.pid}`);
    expect(error.message).toContain("Only one process may serve a data root at a time");
    expect(error.message).not.toContain("delete");
  });

  it("reclaims the root from a holder that was killed without giving it up", async () => {
    const holder = await holdInAnotherProcess("the web panel");
    await stop(holder);
    expect(existsSync(fluxIQDataRootOwnerFile(root))).toBe(true);
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev" });
    const owner = JSON.parse(await readFile(claim.ownerFile, "utf8")) as FluxIQDataRootOwner;
    expect(owner).toMatchObject({ role: "fluxiq dev", pid: process.pid, token: claim.token });
    await claim.release();
    expect(existsSync(claim.ownerFile)).toBe(false);
  });

  it("reclaims a record whose process id now belongs to a process that started later", async () => {
    const other = await aliveProcess();
    expect((await processStartTime(other.pid!)).kind).toBe("read");
    await writeOwner({ pid: other.pid!, startedAt: "an earlier process with the same id" });
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev" });
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: claim.token });
    await claim.release();
  });

  it("treats a record with the same id and start time as the live holder", async () => {
    const other = await aliveProcess();
    await writeOwner({ pid: other.pid!, startedAt: await startTimeOf(other.pid!) });
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev" }));
    expect(error.holder.kind).toBe("live");
  });

  it("never reclaims a holder on another machine, and says how to clear a stale one", async () => {
    await writeOwner({ pid: 4242, machine: "0".repeat(64), hostname: "another-host" });
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev" }));
    expect(error.holder.kind).toBe("foreign");
    expect(error.message).toContain("another-host");
    expect(error.message).toContain(`delete ${fluxIQDataRootOwnerFile(root)}`);
  });

  it("refuses rather than guesses when the owner file cannot be read", async () => {
    await writeFile(fluxIQDataRootOwnerFile(root), "", "utf8");
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev" }));
    expect(error.holder.kind).toBe("unreadable");
  });

  it("refuses when the holder is running but its start time was never recorded", async () => {
    const other = await aliveProcess();
    await writeOwner({ pid: other.pid!, startedAt: null });
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev" }));
    expect(error.holder.kind).toBe("unverified");
  });

  it("reclaims past a reclaim guard left by a claimant that died", async () => {
    const dead = await aliveProcess();
    const deadPid = dead.pid!;
    await stop(dead);
    const owner = await writeOwner({ pid: deadPid, startedAt: "gone" });
    await writeFile(`${fluxIQDataRootOwnerFile(root)}.reclaim`, JSON.stringify({ ...owner, token: "guard-token" }), "utf8");
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev" });
    expect(existsSync(`${claim.ownerFile}.reclaim`)).toBe(false);
    await claim.release();
  });

  it("lets only one of two claimants that race for a dead holder's root win", async () => {
    const dead = await aliveProcess();
    const deadPid = dead.pid!;
    await stop(dead);
    await writeOwner({ pid: deadPid, startedAt: "gone" });
    const self = await currentProcessIdentity();
    // Two other processes on this machine, both alive as far as the probe says.
    const identity = (pid: number): ProcessIdentity => ({ ...self, pid, startedAt: `started-${pid}` });
    const probe = {
      exists: (pid: number) => pid !== deadPid,
      startedAt: async (pid: number) => ({ kind: "read" as const, value: `started-${pid}` })
    };
    const outcomes = await Promise.allSettled([
      claimFluxIQDataRoot(root, { role: "first", identity: identity(900_001), probe }),
      claimFluxIQDataRoot(root, { role: "second", identity: identity(900_002), probe })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const lost = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(FluxIQDataRootHeldError);
    expect((lost.reason as FluxIQDataRootHeldError).holder.kind).toBe("live");
  });

  it("shares one claim among callers in this process and gives it up with the last", async () => {
    const first = await claimFluxIQDataRoot(root, { role: "the web panel" });
    const second = await claimFluxIQDataRoot(path.join(root, "."), { role: "the web panel" });
    expect(second.token).toBe(first.token);
    await first.release();
    expect(existsSync(first.ownerFile)).toBe(true);
    await second.release();
    expect(existsSync(first.ownerFile)).toBe(false);
  });

  it("leaves a fresh root fresh: nothing is written inside its state directory", async () => {
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev" });
    expect(claim.ownerFile).toBe(path.join(root, ".fluxiq.owner"));
    // Any entry in `.fluxiq` would make inspectFluxIQStorage read a fresh root as legacy storage.
    expect(existsSync(path.join(root, ".fluxiq"))).toBe(false);
    expect((await readdir(root)).sort()).toEqual([".fluxiq.owner"]);
    await claim.release();
  });
});
