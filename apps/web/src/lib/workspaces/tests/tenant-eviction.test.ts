import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { FluxIQ, fluxiqLayoutV3Paths, removeFluxIQWorkspaceRoot, type FluxIQOptions } from "fluxiq";
import type { HeldKeys } from "fluxiq/secret-keys";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantFluxIQ } from "../create-tenant";
import { FluxIQWorkspaceManager } from "../workspace-manager";

// Real tenant instances under layout v3, a fake clock for the manager, and a
// stubbed fetch: nothing leaves the process and no model is paid for. Two
// tenants are open; the idle one is evicted and collected, the busy ones (a
// lease, an open gateway session) stay past the idle time and the cap; the
// evicted one, created again, answers a chat message on the key unlocked
// before its eviction. Dummy names, passwords and key values only.

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const PASSWORD = "dummy-password-123";
const KEY_VALUE = "sk-dummy-0123456789abcdef";
const IDLE_MS = 60_000;

const roots: string[] = [];
const originalProfile = process.env.FLUXIQ_PROFILE;

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalProfile === undefined) delete process.env.FLUXIQ_PROFILE;
  else process.env.FLUXIQ_PROFILE = originalProfile;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A DeepSeek-shaped reply carrying the conversation model's plain reply. */
function deepSeekReply(): Response {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ reply: "Hello from the stub." }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

/** Collects until every reference clears or ten rounds pass; a WeakRef target survives the job that created it, so each round yields first. */
async function collected(references: Array<WeakRef<object>>): Promise<boolean> {
  for (let round = 0; round < 10; round += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    gc();
    if (references.every((reference) => reference.deref() === undefined)) return true;
  }
  return false;
}

function setUp() {
  const dataRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-workspaces-"));
  roots.push(dataRoot);
  let clock = 1_000;
  const custody = new Map<string, HeldKeys>();
  const warnings: string[] = [];
  const primary = FluxIQ.create({ rootDir: dataRoot, loadEnv: false, modelProvidersEnabled: false });
  const instantiate = (options: FluxIQOptions) => FluxIQ.create({ ...options, modelProvidersEnabled: true });
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi",
    primaryWorkspaceId: "workspace-main",
    createPrimary: () => primary,
    // A plain function, not a mock: a mock keeps every instance it returned.
    createTenant: async ({ workspaceId, heldKeys, primary: owner }) => {
      custody.set(workspaceId, heldKeys);
      return await createTenantFluxIQ({ workspaceId, heldKeys, dataRoot: owner.paths.root, instantiate });
    },
    removeTenantRoot: async ({ workspaceId, primary: owner }) => {
      await removeFluxIQWorkspaceRoot(fluxiqLayoutV3Paths(owner.paths.root), workspaceId);
    },
    idleMs: IDLE_MS,
    cacheMax: 3,
    sweepIntervalMs: 0,
    now: () => clock,
    warn: (message) => warnings.push(message)
  });
  return { dataRoot, manager, custody, warnings, advance: (ms: number) => { clock += ms; } };
}

/** Signs a person in to the workspace, stores their DeepSeek key and unlocks it for the session; keeps no reference to the instance. */
async function unlockIn(manager: FluxIQWorkspaceManager, workspaceId: string): Promise<{ userId: string; sessionId: string; instance: WeakRef<FluxIQ> }> {
  const lease = await manager.acquire(workspaceId);
  try {
    const { identityAccess, secretKeys } = lease.fluxiq.programs;
    const user = await identityAccess.upsertUser({ username: "owner", displayName: "Owner", roleId: "admin", password: PASSWORD });
    const session = await identityAccess.createSession(user.id);
    await secretKeys.createKey({ name: "DeepSeek", value: KEY_VALUE, kind: "llm", provider: "deepseek", authorizationPassword: PASSWORD, createdBy: user.id });
    await secretKeys.unlockSession({ sessionId: session.id, userId: user.id, authorizationPassword: PASSWORD, expiresAtMs: Date.now() + 60 * 60 * 1000 });
    return { userId: user.id, sessionId: session.id, instance: new WeakRef(lease.fluxiq) };
  } finally {
    lease.release();
  }
}

describe("the workspace manager over real tenant instances", () => {
  it("evicts the idle tenant, keeps the busy ones past the idle time and the cap, and the recreated tenant answers on the unlock made before eviction", async () => {
    delete process.env.FLUXIQ_PROFILE;
    const fetchStub = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => deepSeekReply());
    // Before any tenant exists: the chat model takes `fetch` when its instance is built.
    vi.stubGlobal("fetch", fetchStub);
    const { dataRoot, manager, custody, warnings, advance } = setUp();
    try {
      const person = await unlockIn(manager, "ws-alpha");
      const busy = await manager.acquire("ws-beta");
      expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-alpha", "ws-beta"]);
      expect(existsSync(path.join(dataRoot, "workspaces", "ws-alpha", ".fluxiq", "config.json"))).toBe(true);
      expect(existsSync(path.join(dataRoot, "workspaces", "layout.json"))).toBe(true);

      advance(IDLE_MS);
      await manager.sweep();

      // The idle tenant is gone and collected; its custody still holds the unlock.
      expect(manager.get("ws-alpha")).toBeUndefined();
      expect(await collected([person.instance])).toBe(true);
      expect(custody.get("ws-alpha")!.sessionCount()).toBe(1);
      // The leased tenant stayed past the idle time.
      expect(manager.get("ws-beta")?.fluxiq).toBe(busy.fluxiq);

      // A third tenant held by an open gateway session, not by a lease.
      const socketLease = await manager.acquire("ws-gamma");
      const socketSession = socketLease.fluxiq.programs.clientGateway.connect({ socket: { send: () => undefined } });
      socketLease.release();
      advance(IDLE_MS);
      await manager.sweep();
      expect(manager.get("ws-gamma")?.busy).toBe(true);

      // The evicted tenant opens again: four open over a cap of three, every one busy, so none is evicted.
      const again = await manager.acquire("ws-alpha");
      expect(again.fluxiq).not.toBe(person.instance.deref());
      await manager.sweep();
      expect(manager.workspaceIds()).toEqual(["workspace-main", "ws-beta", "ws-gamma", "ws-alpha"]);
      expect(warnings.filter((line) => line.includes("More workspaces are busy"))).toHaveLength(1);

      // No unlock in the new instance: it finds the one made before eviction, and the chat's model call carries its key.
      const automationStudio = again.fluxiq.programs.automationStudio;
      expect(again.fluxiq.programs.secretKeys.unlockedSessionFor(person.userId)).toBe(person.sessionId);
      const project = await automationStudio.createProject({ name: "Workspace probe" });
      const thread = await automationStudio.conversations.openConversation({ projectId: project.id, subject: { kind: "project", id: project.id }, title: null });
      const answer = await automationStudio.conversations.respondToPersonTurn({
        projectId: project.id,
        conversationId: thread.conversationId,
        text: "hello",
        capabilities: [],
        flows: [],
        onScreen: {},
        caller: { userId: person.userId, sessionId: person.sessionId }
      });
      expect(fetchStub).toHaveBeenCalled();
      const [url, init] = fetchStub.mock.calls[0]!;
      expect(String(url)).toBe("https://api.deepseek.com/chat/completions");
      expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY_VALUE}`);
      expect(answer.response).toMatchObject({ source: "model", decision: { kind: "reply", text: "Hello from the stub." } });

      // The session ends, and the tenant it held goes after the idle time.
      socketLease.fluxiq.programs.clientGateway.disconnect(socketSession.sessionId);
      advance(IDLE_MS);
      await manager.sweep();
      expect(manager.get("ws-gamma")).toBeUndefined();

      // Deleting a tenant revokes its people's unlocks and removes its root.
      again.release();
      // The chat's project database closes a second after its last use; until then the tenant is busy and a delete is refused.
      await vi.waitFor(() => expect(manager.get("ws-alpha")?.busy).toBe(false), { timeout: 10_000 });
      const alphaCustody = custody.get("ws-alpha")!;
      await manager.deleteWorkspace("ws-alpha");
      expect(alphaCustody.sessionCount()).toBe(0);
      expect(existsSync(path.join(dataRoot, "workspaces", "ws-alpha"))).toBe(false);
      busy.release();
    } finally {
      await manager.close();
    }
    expect([...custody.values()].every((heldKeys) => heldKeys.sessionCount() === 0)).toBe(true);
  }, 180_000);

  it("refuses a storage setting in the environment that every tenant would share", async () => {
    const dataRoot = mkdtempSync(path.join(os.tmpdir(), "fluxiq-workspaces-shared-"));
    roots.push(dataRoot);
    const instantiate = vi.fn((options: FluxIQOptions) => FluxIQ.create(options));
    const { HeldKeys } = await import("fluxiq/secret-keys");
    for (const value of [path.join(dataRoot, "shared"), "../shared"]) {
      await expect(createTenantFluxIQ({ workspaceId: "ws-a", heldKeys: new HeldKeys(), dataRoot, instantiate, env: { FLUXIQ_DATA_DIR: value } }))
        .rejects.toThrow("workspaces.shared_storage_refused");
    }
    await expect(createTenantFluxIQ({ workspaceId: "../escape", heldKeys: new HeldKeys(), dataRoot, instantiate, env: {} })).rejects.toThrow("storage.workspace_id_invalid");
    expect(instantiate).not.toHaveBeenCalled();
  });
});
