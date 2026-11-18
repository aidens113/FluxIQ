// Covers model-access/push.ts with fakes: one change runs the gateway's publish and every panel listener; the
// installed authority answers only an enabled person with a role, read as the paired route reads them; the
// identity's directory changes are heard; and `stop` undoes everything it installed.
import { describe, expect, it, vi } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import type { ClientGatewayService } from "../../../../client-gateway/index.ts";
import { installModelAccessPush, type ModelAccessChangeSource, type ModelAccessPushIdentity } from "../index.ts";

type Authority = Parameters<ClientGatewayService["modelAccessPush"]["setAuthority"]>[0];

const READY: ModelAccessState = { status: "ready", message: "Your chats can reach a model.", key: { id: "key.1", name: "Work", provider: "anthropic", model: "claude-test" }, lastCall: null };

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

function parts(people: Array<{ id: string; roleId: string; enabled: boolean }> = [{ id: "user.alice", roleId: "admin", enabled: true }]) {
  const keys = source();
  const directory = source();
  const identity: ModelAccessPushIdentity = { snapshot: async () => ({ users: people, roles: [{ id: "admin" }] }), directoryChanges: directory.changes };
  let authority: Authority;
  const gateway = { setAuthority: vi.fn((next: Authority) => { authority = next; }), publish: vi.fn(() => 0) };
  const stateOf = vi.fn(async () => READY);
  const push = installModelAccessPush({ gateway, sources: [keys.changes], identity: async () => identity, stateOf });
  const ask = async (userId: string) => await authority!({ sessionId: "session.1", userId, trustedClientId: "trust.1" });
  return { keys, directory, gateway, stateOf, push, ask, authority: () => authority };
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

  it("answers an enabled person with a role with their state, asking with the gateway's session id", async () => {
    const { ask, stateOf } = parts();
    await expect(ask("user.alice")).resolves.toEqual(READY);
    expect(stateOf).toHaveBeenCalledWith({ sessionId: "session.1", userId: "user.alice" });
  });

  it("answers null, reading nothing, for a person disabled, gone or without a role", async () => {
    const { ask, stateOf } = parts([{ id: "user.off", roleId: "admin", enabled: false }, { id: "user.roleless", roleId: "removed", enabled: true }]);
    for (const userId of ["user.off", "user.roleless", "user.gone"]) await expect(ask(userId)).resolves.toBeNull();
    expect(stateOf).not.toHaveBeenCalled();
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
