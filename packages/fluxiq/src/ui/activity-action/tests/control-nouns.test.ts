import { describe, expect, it } from "vitest";
import { activityActionControlNoun } from "../index.ts";

// t753: a control the page view printed no words for is said by its kind.
describe("activityActionControlNoun", () => {
  it("says a kind the view prints as a plain noun", () => {
    expect(activityActionControlNoun("button")).toBe("a button");
    expect(activityActionControlNoun("link")).toBe("a link");
    expect(activityActionControlNoun("clickable")).toBe("a control");
    expect(activityActionControlNoun("checkbox")).toBe("a box");
    expect(activityActionControlNoun("option")).toBe("an option");
  });

  it("says nothing for a word it does not know", () => {
    expect(activityActionControlNoun("frobnicator")).toBeUndefined();
    expect(activityActionControlNoun(undefined)).toBeUndefined();
  });
});
