// A task is its words on its site: spacing, case and a sentence's end are not a difference, other words and another site are.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstTaskKey as key } from "../index.ts";

const ASK = "List the books on loan to member 12";
const SITE = "https://lending.example.test/desk";

describe("the task key", () => {
  it("looks like task.<40 hex>", () => {
    expect(key({ instructionText: ASK, startLocation: SITE })).toMatch(/^task\.[0-9a-f]{40}$/);
  });
  it("treats whitespace-only differences as one task", () => {
    expect(key({ instructionText: `  List the  books\n on loan\tto member 12 `, startLocation: SITE })).toBe(key({ instructionText: ASK, startLocation: SITE }));
  });
  it("treats a case difference, or a sentence's end, as the same task (t869)", () => {
    const same = key({ instructionText: ASK, startLocation: SITE });
    for (const typed of [ASK.toLowerCase(), ASK.toUpperCase(), `${ASK}.`, `${ASK.toLowerCase()}. `, `${ASK}!`, `${ASK}?`, `${ASK} ...`, `${ASK}…`, `${ASK}.\n`]) {
      expect(key({ instructionText: typed, startLocation: SITE }), typed).toBe(same);
    }
  });
  it("keeps punctuation inside the words, and a closing quote, and other words stay another task", () => {
    const same = key({ instructionText: ASK, startLocation: SITE });
    expect(key({ instructionText: "List the books, on loan to member 12", startLocation: SITE })).not.toBe(same);
    expect(key({ instructionText: 'Find "Atlas"', startLocation: SITE })).not.toBe(key({ instructionText: 'Find "Atlas', startLocation: SITE }));
    expect(key({ instructionText: "Show the books member 12 has on loan", startLocation: SITE })).not.toBe(same);
    expect(key({ instructionText: `${ASK} again`, startLocation: SITE })).not.toBe(same);
  });
  it("treats another origin as another task, but not another path or host case", () => {
    expect(key({ instructionText: ASK, startLocation: "https://other.example.test/desk" })).not.toBe(key({ instructionText: ASK, startLocation: SITE }));
    expect(key({ instructionText: ASK, startLocation: "https://LENDING.example.test/other?x=1" })).toBe(key({ instructionText: ASK, startLocation: SITE }));
  });
  it("does not throw on a bad or absent location", () => {
    const none = key({ instructionText: ASK });
    expect(key({ instructionText: ASK, startLocation: "not a url" })).toBe(none);
    expect(key({ instructionText: ASK, startLocation: "" })).toBe(none);
    expect(key({ instructionText: ASK, startLocation: "about:blank" })).toBe(none);
    expect(none).not.toBe(key({ instructionText: ASK, startLocation: SITE }));
  });
  it("keeps the digest of words and site exactly as it was, so no task kept before this is lost", () => {
    // The key a chat attempt has always had for these words on this site, computed by the formula before the caller's key existed.
    expect(key({ instructionText: ASK, startLocation: SITE })).toBe("task.907f0c397f928cbf306a2cdef89ad89bbdfab63a");
    expect(key({ instructionText: ASK, startLocation: SITE, callerKey: undefined })).toBe("task.907f0c397f928cbf306a2cdef89ad89bbdfab63a");
    expect(key({ instructionText: ASK, startLocation: SITE, callerKey: "" })).toBe(key({ instructionText: ASK, startLocation: SITE }));
  });
  it("a caller's key names the task whatever its words and site, and never meets a key made from words", () => {
    const named = key({ instructionText: ASK, startLocation: SITE, callerKey: "market.cheapest-listings:3f2a" });
    expect(named).toMatch(/^task\.[0-9a-f]{40}$/);
    expect(key({ instructionText: "Other words entirely", startLocation: "https://other.example.test/", callerKey: "market.cheapest-listings:3f2a" })).toBe(named);
    expect(key({ instructionText: ASK, startLocation: SITE, callerKey: "market.cheapest-listings:9b1c" })).not.toBe(named);
    expect(named).not.toBe(key({ instructionText: ASK, startLocation: SITE }));
    // A caller whose key is the very words, or the words' pair, still gets its own space.
    expect(key({ instructionText: "x", callerKey: ASK.toLowerCase() })).not.toBe(key({ instructionText: ASK }));
  });
});
