import { describe, expect, it } from "vitest";
import { removeKey } from "../remove-key";
import { replaceKey } from "../replace-key";
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
  it("is ONE call with no password in it, and never asks the engine for a press grant first", async () => {
    const { port, calls } = fakePort(() => ({ ok: true }));
    expect(await removeKey(port, "key.a")).toEqual({ kind: "removed" });
    expect(calls).toEqual([{ programId: "secret-keys", endpoint: "delete-key", payload: { id: "key.a" } }]);
    expect(calls.some((call) => call.endpoint === "mint-press-grant" || call.programId === "identity-access")).toBe(false);
  });

  it("never sends a PIN or a password", async () => {
    const { port, calls } = fakePort(() => ({ ok: true }));
    await removeKey(port, "key.a");
    expect(JSON.stringify(calls)).not.toMatch(/pin|password/iu);
  });

  it("says the engine's own sentence when it refuses, without calling again or matching its words", async () => {
    const { port, calls } = fakePort(() => ({ ok: false, error: "You may not remove that key." }));
    expect(await removeKey(port, "key.a")).toEqual({ kind: "refused", message: "You may not remove that key." });
    expect(calls).toHaveLength(1);
  });

  it("says a plain sentence when the engine gives none", async () => {
    const { port } = fakePort(() => ({ ok: false }));
    expect(await removeKey(port, "key.a")).toEqual({ kind: "refused", message: "That key could not be removed. Try again." });
  });
});

describe("replacing a key", () => {
  it("is one rotate-key call with the new value and no password", async () => {
    const { port, calls } = fakePort(() => ({ ok: true }));
    expect(await replaceKey(port, "key.a", "sk-new")).toBe("");
    expect(calls).toEqual([{ programId: "secret-keys", endpoint: "rotate-key", payload: { id: "key.a", value: "sk-new" } }]);
  });

  it("answers the engine's sentence when it refuses", async () => {
    const { port } = fakePort(() => ({ ok: false, error: "You may not replace that key." }));
    expect(await replaceKey(port, "key.a", "sk-new")).toBe("You may not replace that key.");
  });
});
