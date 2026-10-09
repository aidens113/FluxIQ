import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_NAMES, ACTIVITY_ACTION_VERB_NAMES, activityActionVerb } from "../index.ts";

describe("ACTIVITY_ACTION_VERB_NAMES", () => {
  it("names a choice and a tick by their act, never Click (lane A U1)", () => {
    expect(ACTIVITY_ACTION_VERB_NAMES.select).toBe("Choose");
    expect(ACTIVITY_ACTION_VERB_NAMES.check).toBe("Tick");
    expect(ACTIVITY_ACTION_VERB_NAMES.next).toBe("Next page");
    expect(ACTIVITY_ACTION_VERB_NAMES.click).toBeUndefined();
  });

  it("names only verbs it knows, in plain words that are no kind's name", () => {
    const kindNames = new Set(Object.values(ACTIVITY_ACTION_NAMES));
    for (const [verb, name] of Object.entries(ACTIVITY_ACTION_VERB_NAMES)) {
      expect(activityActionVerb(verb)?.verb ?? verb).toBe(verb);
      expect(name).toMatch(/^[A-Z][a-z]+(?: [a-z]+)?$/u);
      expect(kindNames.has(name!)).toBe(false);
    }
  });
});
