import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
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
// Short windows so a test watches a heartbeat for a fraction of a second, not twenty.
const lease = { renewMs: 40, staleAfterMs: 400 };
let root: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fluxiq-data-root-owner-"));
});

afterEach(async () => {
  for (const child of children.splice(0)) await stop(child);
  await rm(root, { recursive: true, force: true });
});

/**
 * A second process that claims the root with the real module and holds it, renewing, until killed.
 * `container` makes it claim as a process in a container with that hostname and no machine id.
 */
async function holdInAnotherProcess(role: string, container?: string): Promise<ChildProcess> {
  const identity = container ? `identity: { pid: process.pid, startedAt: "container-start", platform: process.platform, machine: null, hostname: ${JSON.stringify(container)} },` : "";
  const script = `const { claimFluxIQDataRoot } = await import(${JSON.stringify(claimModule)});
await claimFluxIQDataRoot(${JSON.stringify(root)}, { role: ${JSON.stringify(role)}, lease: ${JSON.stringify(lease)}, ${identity} });
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

  it("reclaims the root of a container recreated after a crash: new hostname, no machine id, nobody renewing", async () => {
    const crashed = await holdInAnotherProcess("the web panel", "container-a1");
    await stop(crashed);
    const self = await currentProcessIdentity();
    const recreated: ProcessIdentity = { ...self, machine: null, hostname: "container-b2" };
    const waits: number[] = [];
    const claim = await claimFluxIQDataRoot(root, { role: "the web panel", identity: recreated, lease, onLost: () => undefined, onWaiting: (_owner, waitMs) => waits.push(waitMs) });
    expect(waits).toEqual([lease.staleAfterMs]);
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: claim.token, hostname: "container-b2" });
    await claim.release();
  });

  it("still refuses a second server while a holder in another container keeps renewing", async () => {
    const holder = await holdInAnotherProcess("the web panel", "container-a1");
    const self = await currentProcessIdentity();
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev", identity: { ...self, machine: null, hostname: "container-b2" }, lease, onLost: () => undefined }));
    expect(error.holder.kind).toBe("renewing");
    expect(error.message).toContain(`the web panel (process ${holder.pid} on container-a1`);
    expect(error.message).toContain("kept renewing its claim");
    expect(error.message).not.toContain("delete");
  });

  it("reclaims an owner file that cannot be read once nobody renews it", async () => {
    await writeFile(fluxIQDataRootOwnerFile(root), "", "utf8");
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: () => undefined });
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: claim.token });
    await claim.release();
  });

  it("settles a running holder whose start time was never recorded by its heartbeat", async () => {
    const other = await aliveProcess();
    await writeOwner({ pid: other.pid!, startedAt: null });
    const file = fluxIQDataRootOwnerFile(root);
    const renewer = setInterval(() => void utimes(file, new Date(), new Date()), 40);
    const error = await refusal(claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: () => undefined }).finally(() => clearInterval(renewer)));
    expect(error.holder.kind).toBe("renewing");
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: () => undefined });
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: claim.token });
    await claim.release();
  });

  it("renews its own claim while it holds the root", async () => {
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: () => undefined });
    const before = (await stat(claim.ownerFile)).mtimeMs;
    await pause(lease.renewMs * 5);
    expect((await stat(claim.ownerFile)).mtimeMs).toBeGreaterThan(before);
    await claim.release();
  });

  it("tells a holder whose root was taken over to stop serving", async () => {
    const lost: string[] = [];
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: (message) => lost.push(message) });
    // Another process took the root over while this one was frozen.
    await writeOwner({ pid: 4242, token: "taker", machine: null, hostname: "container-b2" });
    await pause(lease.renewMs * 5);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toContain(`FluxIQ stopped fluxiq dev: another process has taken over the FluxIQ data at ${root}.`);
    await claim.release();
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: "taker" });
  });

  it("writes its claim again when its owner file disappears, and stops quietly when the root itself is gone", async () => {
    const lost: string[] = [];
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: (message) => lost.push(message) });
    await rm(claim.ownerFile);
    await pause(lease.renewMs * 5);
    expect(JSON.parse(await readFile(claim.ownerFile, "utf8"))).toMatchObject({ token: claim.token });
    await rm(root, { recursive: true, force: true });
    await pause(lease.renewMs * 5);
    expect(lost).toEqual([]);
    await claim.release();
  });

  it("claims a root made again at a deleted root's path afresh, not with the claim the deletion ended", async () => {
    const first = await claimFluxIQDataRoot(root, { role: "the web panel", lease, onLost: () => undefined });
    await rm(root, { recursive: true, force: true });
    // Renewal finds the root gone and ends the claim.
    await pause(lease.renewMs * 5);
    await mkdir(root, { recursive: true });
    const second = await claimFluxIQDataRoot(root, { role: "the web panel", lease, onLost: () => undefined });
    expect(second.token).not.toBe(first.token);
    expect(JSON.parse(await readFile(second.ownerFile, "utf8"))).toMatchObject({ token: second.token });
    // Live: its holder keeps renewing it.
    const before = (await stat(second.ownerFile)).mtimeMs;
    await pause(lease.renewMs * 5);
    expect((await stat(second.ownerFile)).mtimeMs).toBeGreaterThan(before);
    // A late release of the ended claim leaves the new one alone.
    await first.release();
    expect(JSON.parse(await readFile(second.ownerFile, "utf8"))).toMatchObject({ token: second.token });
    await second.release();
    expect(existsSync(second.ownerFile)).toBe(false);
  });

  it("reclaims past a reclaim guard left by a claimant in another container that died", async () => {
    const dead = await aliveProcess();
    const deadPid = dead.pid!;
    await stop(dead);
    const owner = await writeOwner({ pid: deadPid, startedAt: "gone" });
    await writeFile(`${fluxIQDataRootOwnerFile(root)}.reclaim`, JSON.stringify({ ...owner, token: "guard-token", machine: null, hostname: "container-a1" }), "utf8");
    const claim = await claimFluxIQDataRoot(root, { role: "fluxiq dev", lease, onLost: () => undefined });
    expect(existsSync(`${claim.ownerFile}.reclaim`)).toBe(false);
    await claim.release();
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
