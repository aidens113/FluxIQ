// A task is its exact words on its site: spacing is not a difference, case and site are.
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
  it("treats a case difference as another task", () => {
    expect(key({ instructionText: ASK.toLowerCase(), startLocation: SITE })).not.toBe(key({ instructionText: ASK, startLocation: SITE }));
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
});
