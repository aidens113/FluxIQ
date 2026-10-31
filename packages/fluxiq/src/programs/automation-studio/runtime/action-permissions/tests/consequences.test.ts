import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES as MODEL_CONSEQUENCES } from "../../../model/action-consequences/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, parseAutomationStudioPermittedConsequences } from "../index.ts";

describe("the existing consequence API after moving its vocabulary into the model", () => {
  it("keeps the same singleton, closed strings, display order and phrases", () => {
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toBe(MODEL_CONSEQUENCES);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCES).toEqual(["move_money", "delete", "send_or_publish", "modify_existing", "create_new"]);
    expect(Object.isFrozen(AUTOMATION_STUDIO_ACTION_CONSEQUENCES)).toBe(true);
    expect(AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES).toEqual({
      move_money: "spend, refund or move money",
      delete: "delete or remove something",
      send_or_publish: "send or publish something that others will receive or see",
      modify_existing: "change something that already exists",
      create_new: "create something new that stays"
    });
  });

  it("keeps strict known-class parsing, deduplication, ordering and the absent empty set", () => {
    expect(parseAutomationStudioPermittedConsequences(undefined)).toEqual([]);
    expect(parseAutomationStudioPermittedConsequences(["create_new", "delete", "delete"])).toEqual(["delete", "create_new"]);
    expect(automationStudioConsequencesInOrder(["create_new", "move_money", "move_money"])).toEqual(["move_money", "create_new"]);
    expect(isAutomationStudioActionConsequence("delete")).toBe(true);
    expect(isAutomationStudioActionConsequence("purchase")).toBe(false);
    expect(() => parseAutomationStudioPermittedConsequences(["delete", "purchase"])).toThrow("Permitted consequences name a class Core does not recognise.");
    for (const value of [null, "delete", Array(11).fill("delete")]) {
      expect(() => parseAutomationStudioPermittedConsequences(value)).toThrow("Permitted consequences must be a list of consequence classes.");
    }
  });
});
