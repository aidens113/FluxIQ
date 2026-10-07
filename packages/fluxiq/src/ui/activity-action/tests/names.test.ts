import { describe, expect, it } from "vitest";
import { ACTIVITY_ACTION_ICONS, ACTIVITY_ACTION_NAMES } from "../index.ts";

describe("ACTIVITY_ACTION_NAMES", () => {
  it("names every kind that has an icon", () => {
    expect(Object.keys(ACTIVITY_ACTION_NAMES).sort()).toEqual(Object.keys(ACTIVITY_ACTION_ICONS).sort());
  });

  it("holds the pinned card labels", () => {
    expect(ACTIVITY_ACTION_NAMES).toEqual({
      click: "Click", type: "Type", navigate: "Open page", read: "Read list", look: "Look", recall: "Recall result", wait: "Wait",
      person_check: "Robot check", permission: "Permission", draft: "Change the Flow", test: "Test run", result_check: "Check result", repair: "Repair", join: "Join paths", branch: "Choose path", repeat: "Repeat", other: "Action"
    });
    expect(Object.isFrozen(ACTIVITY_ACTION_NAMES)).toBe(true);
  });
});
