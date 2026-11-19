// Covers model-access/push.ts with fakes: one change runs the gateway's publish and every panel listener; the
// installed authority answers only a person the registry's IAM lets read the Secret Keys snapshot on that session
// (F4), read as the paired route reads them; the identity's directory changes are heard; and `stop` undoes
// everything it installed. The real registry's agreement with the snapshot is `recipient-decision.test.ts`.
import { describe, expect, it, vi } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import type { IamDecision } from "../../../../platform/iam/index.ts";
import { endpointResource, type ProgramApiAuthorization, type ProgramApiAuthorizeInput } from "../../iam/index.ts";
import { installModelAccessPush, type ModelAccessChangeSource, type ModelAccessPushIdentity, type ModelAccessPushRegistry } from "../index.ts";

type Authority = Parameters<ClientGatewayService["modelAccessPush"]["setAuthority"]>[0];

const READY: ModelAccessState = { status: "ready", message: "Your chats can reach a model.", key: { id: "key.1", name: "Work", provider: "anthropic", model: "claude-test" }, lastCall: null };

/** The snapshot as Secret Keys registers it: what the push decides each recipient by. */
const SNAPSHOT_REGISTRATION = { programId: "secret-keys", endpoint: "snapshot", permission: "programs.read", classification: "read", action: "secrets:Snapshot", accessLevel: "Read", resource: endpointResource.workspace() } as const;
const ALLOWED: ProgramApiAuthorization = { allowed: true, decision: { decision: "allow" } as IamDecision };
const DENIED: ProgramApiAuthorization = { allowed: false, decision: { decision: "deny" } as IamDecision, response: { ok: false, error: "refused", errorCode: "authorization.forbidden" } };

/** A change source a test fires, counting who listens. */
function source() {
  const listeners = new Set<() => void>();
  const changes: ModelAccessChangeSource = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  return { changes, listeners, fire: () => { for (const listener of [...listeners]) listener(); } };
}

function parts(
  people: Array<{ id: string; roleId: string; enabled: boolean }> = [{ id: "user.alice", roleId: "admin", enabled: true }],
  roles: Array<{ id: string; permissions: string[] }> = [{ id: "admin", permissions: ["programs.read", "secrets.manage"] }]
) {
  const keys = source();
  const directory = source();
  const identity: ModelAccessPushIdentity = { snapshot: async () => ({ users: people, roles }), directoryChanges: directory.changes };
  let authority: Authority;
  const gateway = { setAuthority: vi.fn((next: Authority) => { authority = next; }), publish: vi.fn(() => 0) };
  const stateOf = vi.fn(async () => READY);
  const decideUnrecorded = vi.fn(async (_input: ProgramApiAuthorizeInput): Promise<ProgramApiAuthorization> => ALLOWED);
  const registry: ModelAccessPushRegistry = { endpoints: () => [SNAPSHOT_REGISTRATION], decideUnrecorded };
  const push = installModelAccessPush({ registry, gateway, sources: [keys.changes], identity: async () => identity, stateOf });
  const ask = async (userId: string) => await authority!({ sessionId: "session.1", userId, trustedClientId: "trust.1" });
  return { keys, directory, gateway, stateOf, decideUnrecorded, push, ask, authority: () => authority };
}

describe("installModelAccessPush", () => {
  it("runs the gateway's publish and every panel listener on each change, one failing listener costing nothing else", () => {
    const { keys, gateway, push } = parts();
    const heard: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    push.changes.subscribe(() => { throw new Error("listener secret words"); });
    push.changes.subscribe(() => heard.push("panel"));
    keys.fire();
    expect(gateway.publish).toHaveBeenCalledOnce();
    expect(heard).toEqual(["panel"]);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("secret words");
    warn.mockRestore();
  });

  it("answers a person IAM lets read the snapshot with their state, deciding as that session's own snapshot call", async () => {
    const { ask, stateOf, decideUnrecorded } = parts();
    await expect(ask("user.alice")).resolves.toEqual(READY);
    expect(stateOf).toHaveBeenCalledWith({ sessionId: "session.1", userId: "user.alice" });
    // The snapshot's own action, permission and resource, for the paired-client actor the route builds, narrowed to that permission.
    expect(decideUnrecorded).toHaveBeenCalledWith({
      actor: { sessionId: "client-gateway:session.1", userId: "user.alice", roleId: "admin", permissions: ["programs.read"], channel: "paired-client" },
      action: "secrets:Snapshot",
      permission: "programs.read",
      resources: { kind: "workspace" },
      programId: "secret-keys"
    });
  });

  it("asks IAM again for each recipient every time the state is worked out", async () => {
    const { ask, decideUnrecorded } = parts();
    await ask("user.alice");
    decideUnrecorded.mockResolvedValueOnce(DENIED);
    await expect(ask("user.alice")).resolves.toBeNull();
    await expect(ask("user.alice")).resolves.toEqual(READY);
    expect(decideUnrecorded).toHaveBeenCalledTimes(3);
  });

  it("answers null, reading no state, when IAM refuses the snapshot to that session", async () => {
    const { ask, stateOf, decideUnrecorded } = parts();
    decideUnrecorded.mockResolvedValue(DENIED);
    await expect(ask("user.alice")).resolves.toBeNull();
    expect(stateOf).not.toHaveBeenCalled();
  });

  it("throws, reading no state, when IAM could not decide", async () => {
    const { ask, stateOf, decideUnrecorded } = parts();
    decideUnrecorded.mockResolvedValue({ allowed: false, decision: null, response: { ok: false, error: "unavailable" } });
    await expect(ask("user.alice")).rejects.toThrow("could not be decided");
    decideUnrecorded.mockResolvedValue({ ...DENIED, decision: { decision: "deny", failure: "unavailable" } as unknown as IamDecision });
    await expect(ask("user.alice")).rejects.toThrow("could not be decided");
    expect(stateOf).not.toHaveBeenCalled();
  });

  it("answers null, asking nothing, for a person disabled, gone, without a role, or whose role lacks the snapshot's permission", async () => {
    const { ask, stateOf, decideUnrecorded } = parts(
      [{ id: "user.off", roleId: "admin", enabled: false }, { id: "user.roleless", roleId: "removed", enabled: true }, { id: "user.blind", roleId: "blind", enabled: true }],
      [{ id: "admin", permissions: ["programs.read"] }, { id: "blind", permissions: ["programs.write"] }]
    );
    for (const userId of ["user.off", "user.roleless", "user.gone", "user.blind"]) await expect(ask(userId)).resolves.toBeNull();
    expect(stateOf).not.toHaveBeenCalled();
    expect(decideUnrecorded).not.toHaveBeenCalled();
  });

  it("hears the identity's directory changes, watching it once however often it is read", async () => {
    const { directory, gateway, ask } = parts();
    await ask("user.alice");
    await ask("user.alice");
    expect(directory.listeners.size).toBe(1);
    directory.fire();
    expect(gateway.publish).toHaveBeenCalledOnce();
  });

  it("stop removes the authority, every subscription and every listener, and is idempotent", async () => {
    const { keys, directory, gateway, push, ask, authority } = parts();
    await ask("user.alice");
    const heard = vi.fn();
    push.changes.subscribe(heard);
    push.stop();
    push.stop();
    expect(authority()).toBeUndefined();
    expect([keys.listeners.size, directory.listeners.size]).toEqual([0, 0]);
    keys.fire();
    expect(gateway.publish).not.toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });
});
