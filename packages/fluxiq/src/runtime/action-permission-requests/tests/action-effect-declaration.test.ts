import { describe, expect, it } from "vitest";
import { AutomationStudioActionDeclarationError, readAutomationStudioActionDeclaration } from "../index.ts";

const DECLARATION = { consequences: [], control: { name: "Apply", kind: "button" }, verb: "press" };

describe("the client floor on an action declaration", () => {
  it("preserves declarations without the additive field and both legacy effect values", () => {
    expect(readAutomationStudioActionDeclaration(DECLARATION)).not.toHaveProperty("actionEffect");
    expect(readAutomationStudioActionDeclaration(DECLARATION).effect).toBe("mutate");
    for (const effect of ["observe", "mutate"] as const) {
      expect(readAutomationStudioActionDeclaration({ ...DECLARATION, effect }).effect).toBe(effect);
    }
  });

  it("retains the separate trusted floor and model classes without inventing a specific consequence", () => {
    expect(readAutomationStudioActionDeclaration({
      ...DECLARATION,
      consequences: ["create_new"],
      effect: "observe",
      actionEffect: { effectClass: "commit", permissionConsequences: ["delete"] }
    })).toMatchObject({ consequences: ["create_new"], effect: "observe", actionEffect: { effectClass: "commit", permissionConsequences: ["delete"] } });
    expect(readAutomationStudioActionDeclaration({ ...DECLARATION, actionEffect: { effectClass: "commit", permissionConsequences: [] } }).actionEffect).toEqual({ effectClass: "commit", permissionConsequences: [] });
  });

  it("raises an observation floor when the client knows a lasting consequence", () => {
    expect(readAutomationStudioActionDeclaration({ ...DECLARATION, actionEffect: { effectClass: "observe", permissionConsequences: ["modify_existing"] } }).actionEffect).toEqual({ effectClass: "commit", permissionConsequences: ["modify_existing"] });
  });

  it("fails the whole declaration on unknown classes, unknown consequences or an unresolved predicate", () => {
    for (const actionEffect of [
      null,
      [],
      { effectClass: "mutate", permissionConsequences: [] },
      { effectClass: "commit" },
      { effectClass: "commit", permissionConsequences: ["delete", "purchase"] },
      { effectClass: "state", permissionConsequences: [], commitWhen: "apply" },
      { effectClass: "commit", permissionConsequences: [], idempotent: true }
    ]) {
      expect(() => readAutomationStudioActionDeclaration({ ...DECLARATION, actionEffect })).toThrow(new AutomationStudioActionDeclarationError("action_effect_invalid"));
    }
  });
});
