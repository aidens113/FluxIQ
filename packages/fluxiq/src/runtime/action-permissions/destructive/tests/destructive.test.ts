import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES,
  automationStudioDestructiveConsequences,
  isAutomationStudioDestructiveActionConsequence
} from "../index.ts";

describe("consequences requiring independent human authority", () => {
  it("names the complete ordered classification", () => {
    expect(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES).toEqual(["move_money", "delete", "send_or_publish"]);
    expect(Object.isFrozen(AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES)).toBe(true);
    for (const consequence of ["move_money", "delete", "send_or_publish"]) expect(isAutomationStudioDestructiveActionConsequence(consequence)).toBe(true);
    for (const consequence of ["modify_existing", "create_new"]) expect(isAutomationStudioDestructiveActionConsequence(consequence)).toBe(false);
  });

  it("refuses inherited object property names and non-vocabulary values", () => {
    for (const value of ["toString", "constructor", "__proto__", "hasOwnProperty", "", undefined, null, {}, 1]) {
      expect(isAutomationStudioDestructiveActionConsequence(value)).toBe(false);
    }
  });

  it("selects the declared classes once in canonical order", () => {
    expect(automationStudioDestructiveConsequences(["create_new", "delete", "move_money", "modify_existing", "send_or_publish", "delete"])).toEqual(["move_money", "delete", "send_or_publish"]);
  });
});
