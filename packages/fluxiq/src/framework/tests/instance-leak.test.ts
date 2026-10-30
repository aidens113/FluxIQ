// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { HeldKeys } from "../../programs/secret-keys/index.ts";
import { automationStudioActivityHub } from "../../programs/automation-studio/runtime/activity/index.ts";
import { programStateConnections } from "../../programs/_shared/storage.ts";
import { heldSessionKey } from "../../programs/secret-keys/runtime/tests/secret-key-fixtures.ts";
import { FluxIQ } from "../index.ts";

// A closed FluxIQ instance leaves nothing behind (t808): no hub subscription,
// no SQLite pool for its root, no timer or handle, and nothing that keeps the
// instance reachable, so a workspace manager can open and drop instances for
// as long as the process lives. Dummy ids, passwords and values only.

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const PASSWORD = "dummy-password";
const USER = "user.owner";
const SESSION = "session.owner";
const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-leak-"));
  roots.push(root);
  return root;
}

async function openAndUse(options: { heldKeys?: HeldKeys; root?: string } = {}): Promise<{ fluxiq: FluxIQ; root: string }> {
  const root = options.root ?? (await tempRoot());
  const fluxiq = FluxIQ.create({ rootDir: root, modelProvidersEnabled: false, loadEnv: false, ...(options.heldKeys ? { heldKeys: options.heldKeys } : {}) });
  fluxiq.inspectStorage();
  await fluxiq.setup();
  await fluxiq.programs.automationStudio.createProject({ name: "Leak probe" });
  return { fluxiq, root };
}

/** Collects until every reference clears or ten rounds pass; a WeakRef target survives the job that made it, so each round yields first. */
async function collected(references: Array<WeakRef<object>>): Promise<boolean> {
  for (let round = 0; round < 10; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
    if (references.every((reference) => reference.deref() === undefined)) return true;
  }
  return false;
}

function handleCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of process.getActiveResourcesInfo()) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

function poolRootsFor(root: string): string[] {
  const marker = path.basename(root);
  return programStateConnections.roots().filter((candidate) => candidate.includes(marker));
}

/** Creates a key and unlocks a session on the instance's own secret keys. */
async function unlock(fluxiq: FluxIQ): Promise<Buffer> {
  const key = await fluxiq.programs.secretKeys.createKey({ name: "Provider", value: "dummy-provider-value", authorizationPassword: PASSWORD, createdBy: USER });
  await fluxiq.programs.secretKeys.unlockSession({ sessionId: SESSION, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: Date.now() + 60 * 60 * 1000 });
  const held = heldSessionKey(fluxiq.programs.secretKeys, SESSION, key.id);
  if (!held) throw new Error("the unlock holds no key");
  return held;
}

const isZeroed = (buffer: Buffer): boolean => buffer.every((byte) => byte === 0);

describe("a closed FluxIQ instance", () => {
  it("leaves no subscriber, pool, handle or reference after repeated open, use and close", async () => {
    const baselineSubscribers = automationStudioActivityHub.subscriberCount();
    const baselinePools = programStateConnections.roots().length;
    const baselineHandles = handleCounts();
    const references: Array<WeakRef<object>> = [];
    const closedRoots: string[] = [];

    for (let cycle = 0; cycle < 20; cycle += 1) {
      let opened: { fluxiq: FluxIQ; root: string } | undefined = await openAndUse();
      expect(automationStudioActivityHub.subscriberCount()).toBe(baselineSubscribers + 1);
      references.push(new WeakRef(opened.fluxiq));
      closedRoots.push(opened.root);
      await opened.fluxiq.close({ mode: "shutdown" });
      opened = undefined;
      expect(automationStudioActivityHub.subscriberCount()).toBe(baselineSubscribers);
    }

    expect(automationStudioActivityHub.subscriberCount()).toBe(baselineSubscribers);
    for (const root of closedRoots) expect(poolRootsFor(root)).toEqual([]);
    expect(programStateConnections.roots().length).toBe(baselinePools);

    expect(await collected(references)).toBe(true);

    const after = handleCounts();
    for (const name of ["Timeout", "TCPSocketWrap", "TCPServerWrap", "FSReqCallback", "ChildProcess"]) {
      expect(after[name] ?? 0, `active ${name} handles`).toBeLessThanOrEqual(baselineHandles[name] ?? 0);
    }
  }, 120_000);

  it("closing one of two live instances leaves the other subscribed and working", async () => {
    const baseline = automationStudioActivityHub.subscriberCount();
    const a = await openAndUse();
    const b = await openAndUse();
    expect(automationStudioActivityHub.subscriberCount()).toBe(baseline + 2);
    await a.fluxiq.close();
    expect(automationStudioActivityHub.subscriberCount()).toBe(baseline + 1);
    expect(poolRootsFor(a.root)).toEqual([]);
    expect(poolRootsFor(b.root).length).toBeGreaterThan(0);
    await expect(b.fluxiq.programs.automationStudio.createProject({ name: "After close of A" })).resolves.toBeTruthy();
    await b.fluxiq.close();
    expect(automationStudioActivityHub.subscriberCount()).toBe(baseline);
  }, 60_000);

  it("evicted with an injected HeldKeys, keeps the unlock for the next instance and still clears", async () => {
    const heldKeys = new HeldKeys();
    const baseline = automationStudioActivityHub.subscriberCount();
    const root = await tempRoot();
    let first: FluxIQ | undefined = (await openAndUse({ heldKeys, root })).fluxiq;
    const held = await unlock(first);
    expect(heldKeys.sessionCount()).toBe(1);
    const reference = new WeakRef(first);
    await first.close({ mode: "evict" });
    first = undefined;
    expect(automationStudioActivityHub.subscriberCount()).toBe(baseline);
    expect(heldKeys.sessionCount()).toBe(1);
    expect(isZeroed(held)).toBe(false);
    expect(await collected([reference])).toBe(true);
    expect(heldKeys.sessionCount()).toBe(1);

    const second = await openAndUse({ heldKeys, root });
    expect(second.fluxiq.programs.secretKeys.unlockedSessionFor(USER)).toBe(SESSION);
    expect(second.fluxiq.programs.secretKeys.activeSessionUnlockCount()).toBe(1);
    await second.fluxiq.close();
    expect(heldKeys.sessionCount()).toBe(0);
    expect(heldKeys.authorizationCount()).toBe(0);
    expect(isZeroed(held)).toBe(true);
  }, 60_000);

  it("evicted without an injected HeldKeys, revokes and zeroes its own unlocks", async () => {
    const { fluxiq } = await openAndUse();
    const held = await unlock(fluxiq);
    expect(fluxiq.programs.secretKeys.activeSessionUnlockCount()).toBe(1);
    await fluxiq.close({ mode: "evict" });
    expect(fluxiq.programs.secretKeys.activeSessionUnlockCount()).toBe(0);
    expect(fluxiq.programs.secretKeys.unlockedSessionFor(USER)).toBeNull();
    expect(isZeroed(held)).toBe(true);
  }, 60_000);
});
