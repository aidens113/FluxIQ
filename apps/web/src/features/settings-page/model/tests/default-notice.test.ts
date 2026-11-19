import { describe, expect, it } from "vitest";
import { defaultNoticeStillTrue } from "../default-notice";
import type { SettingsKey } from "../types";

const key = (id: string, createdAtMs: number, kind: SettingsKey["kind"] = "llm"): SettingsKey => ({ id, name: id, kind, enabled: true, createdAtMs });
const notice = { message: "Your default key was removed, and there is no other model key. Add one in Settings.", atMs: 1_000 };

describe("the note about a lost default key", () => {
  it("is not there without one", () => {
    expect(defaultNoticeStillTrue(undefined, [])).toBe(false);
  });
  it("is true while no key was added after it was written", () => {
    expect(defaultNoticeStillTrue(notice, [])).toBe(true);
    expect(defaultNoticeStillTrue(notice, [key("old", 500)])).toBe(true);
  });
  it("is stale once a model key was added after it, whatever the note says", () => {
    expect(defaultNoticeStillTrue(notice, [key("new", 2_000)])).toBe(false);
  });
  it("is not made stale by a saved login for a Flow", () => {
    expect(defaultNoticeStillTrue(notice, [key("login", 2_000, "custom")])).toBe(true);
  });
});
