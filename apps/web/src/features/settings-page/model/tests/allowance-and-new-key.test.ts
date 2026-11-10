import { describe, expect, it } from "vitest";
import { allowanceWords } from "../allowance-words";
import { parseAllowance } from "../allowance-input";
import { ENGINE_TOOLS, engineToolHref } from "../engine-tools";
import { EMPTY_NEW_KEY, canSaveNewKey, newKeyPayload } from "../new-key";

describe("the allowance a person types", () => {
  it("reads dollars, with or without the sign", () => {
    expect(parseAllowance("0.75")).toEqual({ ok: true, usd: 0.75 });
    expect(parseAllowance(" $2 ")).toEqual({ ok: true, usd: 2 });
  });
  it("reads an empty box as the usual amount", () => {
    expect(parseAllowance("")).toEqual({ ok: true, usd: null });
  });
  it("refuses words, zero and negatives in plain words", () => {
    for (const text of ["abc", "0", "-1"]) expect(parseAllowance(text)).toEqual({ ok: false, message: "Type an amount in dollars, like 0.50." });
  });
  it("says an amount as dollars", () => {
    expect(allowanceWords(0.5)).toBe("$0.50");
  });
});

describe("adding a key", () => {
  const filled = { ...EMPTY_NEW_KEY, name: " Work ", value: "sk-secret", password: "pw" };
  it("needs a name, the value and the password", () => {
    expect(canSaveNewKey(EMPTY_NEW_KEY)).toBe(false);
    expect(canSaveNewKey(filled)).toBe(true);
  });
  it("sends the existing create-key shape: a global, enabled model key sealed by the password", () => {
    expect(newKeyPayload(filled)).toEqual({ name: "Work", value: "sk-secret", kind: "llm", provider: "Anthropic", scope: "global", scopeRef: "", description: "", metadata: {}, enabled: true, authorizationPassword: "pw" });
  });
  it("adds the PIN only when one was typed", () => {
    expect(newKeyPayload({ ...filled, pin: "1234" })).toMatchObject({ authorizationPin: "1234" });
    expect(newKeyPayload(filled)).not.toHaveProperty("authorizationPin");
  });
});

describe("engine tools", () => {
  it("link the nine existing program pages unchanged", () => {
    expect(ENGINE_TOOLS.map(engineToolHref)).toEqual([
      "/programs/background-tasks", "/programs/deployment-sync", "/programs/database-manager", "/programs/docs", "/programs/runtime",
      "/programs/compute-control", "/programs/production-runner", "/programs/identity-access", "/programs/secret-keys"
    ]);
  });
});
