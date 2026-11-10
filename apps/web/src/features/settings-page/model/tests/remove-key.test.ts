import { describe, expect, it } from "vitest";
import { removeKey } from "../remove-key";
import type { SettingsCallPayload, SettingsCallResult, SettingsPort } from "../types";

type Call = { programId: string; endpoint: string; payload?: SettingsCallPayload };

function fakePort(answer: (call: Call) => SettingsCallResult): { port: SettingsPort; calls: Call[] } {
  const calls: Call[] = [];
  const port: SettingsPort = {
    async call<T>(programId: string, endpoint: string, payload?: SettingsCallPayload) {
      const call: Call = { programId, endpoint, ...(payload ? { payload } : {}) };
      calls.push(call);
      return answer(call) as SettingsCallResult<T>;
    }
  };
  return { port, calls };
}

describe("removing a key", () => {
  it("mints a grant for the exact call, then sends that payload plus the grant", async () => {
    const { port, calls } = fakePort((call) => (call.endpoint === "mint-press-grant" ? { ok: true, payload: { grant: "g-1", expiresAt: 1 } } : { ok: true }));
    expect(await removeKey(port, "key.a")).toEqual({ kind: "removed" });
    expect(calls).toEqual([
      { programId: "identity-access", endpoint: "mint-press-grant", payload: { programId: "secret-keys", endpoint: "delete-key", payload: { id: "key.a" } } },
      { programId: "secret-keys", endpoint: "delete-key", payload: { id: "key.a", pressGrant: "g-1" } }
    ]);
  });

  it("mints for the same payload it sends, password included", async () => {
    const { port, calls } = fakePort((call) => (call.endpoint === "mint-press-grant" ? { ok: true, payload: { grant: "g-2" } } : { ok: true }));
    await removeKey(port, "key.a", { password: "pw" });
    expect(calls[0]?.payload?.payload).toEqual({ id: "key.a", authorizationPassword: "pw" });
    expect(calls[1]?.payload).toEqual({ id: "key.a", authorizationPassword: "pw", pressGrant: "g-2" });
  });

  it("asks for a PIN only when the engine says the person turned one on, and then sends it without a grant", async () => {
    const { port, calls } = fakePort((call) => {
      if (call.endpoint === "mint-press-grant") return { ok: false, error: "PIN is required for this action" };
      return { ok: true };
    });
    expect(await removeKey(port, "key.a")).toEqual({ kind: "needs-pin" });
    expect(calls).toHaveLength(1);
    expect(await removeKey(port, "key.a", { pin: "1234" })).toEqual({ kind: "removed" });
    expect(calls.at(-1)).toEqual({ programId: "secret-keys", endpoint: "delete-key", payload: { id: "key.a", authorizationPin: "1234" } });
    expect(calls.filter((call) => call.endpoint === "mint-press-grant")).toHaveLength(1);
  });

  it("sends the call without a grant when the engine says the endpoint needs no confirmation, and asks for the password it still wants", async () => {
    const { port, calls } = fakePort((call) => {
      if (call.endpoint === "mint-press-grant") return { ok: false, error: "That action does not need a confirmation." };
      return { ok: false, requiresRecheck: true, error: "Password is required" };
    });
    expect(await removeKey(port, "key.a")).toEqual({ kind: "needs-password", message: "Type your password to remove this key." });
    expect(calls[1]?.payload).toEqual({ id: "key.a" });
  });

  it("reports a refused mint in the engine's words and sends no delete", async () => {
    const { port, calls } = fakePort(() => ({ ok: false, error: "Sign in to the panel to confirm this." }));
    expect(await removeKey(port, "key.a")).toEqual({ kind: "refused", message: "Sign in to the panel to confirm this." });
    expect(calls).toHaveLength(1);
  });

  it("reports a refused delete, never as removed", async () => {
    const { port } = fakePort((call) => (call.endpoint === "mint-press-grant" ? { ok: true, payload: { grant: "g" } } : { ok: false, error: "That confirmation was used already, ran out, or was for something else. Press Allow again." }));
    const outcome = await removeKey(port, "key.a");
    expect(outcome.kind).toBe("refused");
  });
});
