import { describe, expect, it } from "vitest";
import { activityActionVerb } from "../index.ts";

describe("activityActionVerb", () => {
  it.each([
    ["click", "click", "click"], ["tap", "click", "click"], ["fill", "type", "type"], ["search", "search", "type"],
    ["nav", "navigate", "navigate"], ["visit", "navigate", "navigate"], ["extract", "read", "read"], ["list", "list", "read"],
    ["inspect", "look", "look"], ["snapshot", "look", "look"], ["wait", "wait", "wait"], ["scroll", "scroll", "other"],
    ["Click", "click", "click"]
  ])("reads %s as the verb %s, a %s", (word, verb, kind) => {
    expect(activityActionVerb(word)).toEqual({ verb, kind });
  });

  it("reads a sentence's opening word as the wording says it", () => {
    expect(activityActionVerb("clicking", "gerund")).toEqual({ verb: "click", kind: "click" });
    expect(activityActionVerb("checking", "gerund")).toEqual({ verb: "assert", kind: "look" });
    expect(activityActionVerb("ticking", "gerund")).toEqual({ verb: "check", kind: "click" });
    // A list's next page (lane C, run-mv0fuotv-805294d7): its node's id read "Dom next page".
    expect(activityActionVerb("next")).toEqual({ verb: "next", kind: "navigate" });
    expect(activityActionVerb("clicking")).toBeUndefined();
  });

  it("knows no word that is not a verb", () => {
    expect(activityActionVerb("dom")).toBeUndefined();
    expect(activityActionVerb("run")).toBeUndefined();
    expect(activityActionVerb("output", "gerund")).toBeUndefined();
  });
});
