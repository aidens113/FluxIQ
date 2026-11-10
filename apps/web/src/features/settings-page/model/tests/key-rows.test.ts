import { describe, expect, it } from "vitest";
import { keyRows } from "../key-rows";
import type { SettingsKey } from "../types";

const at = (ms: number) => `t${ms}`;
const keys: SettingsKey[] = [
  { id: "a", name: "Work", kind: "llm", provider: "Anthropic", enabled: true },
  { id: "b", name: "Spare", kind: "llm", provider: "DeepSeek", enabled: false, lastUsedAtMs: 5 },
  { id: "c", name: "Webhook", kind: "custom", enabled: true }
];

describe("key rows", () => {
  it("list model keys only, with provider, on/off and last use when known", () => {
    const rows = keyRows(keys, null, at);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows[1]).toMatchObject({ provider: "DeepSeek", status: "Off", lastUsed: "t5" });
    expect(rows[0]).not.toHaveProperty("lastUsed");
  });

  it("mark the first enabled key as the default when none is stored", () => {
    expect(keyRows(keys, null, at).map((row) => row.isDefault)).toEqual([true, false]);
  });

  it("never mark a stored default that is off or gone", () => {
    expect(keyRows(keys, "b", at).map((row) => row.isDefault)).toEqual([true, false]);
    expect(keyRows(keys, "missing", at).map((row) => row.isDefault)).toEqual([true, false]);
  });

  it("mark the stored default when it is an enabled model key", () => {
    const two = [...keys, { id: "d", name: "Third", kind: "llm", provider: "DeepSeek", enabled: true } as SettingsKey];
    expect(keyRows(two, "d", at).map((row) => row.isDefault)).toEqual([false, false, true]);
  });
});
