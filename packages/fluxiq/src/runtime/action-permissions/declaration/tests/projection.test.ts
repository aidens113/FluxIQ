import { expect, it } from "vitest";
import { readAutomationStudioActionDeclaration, automationStudioActionPermissionProjection, AutomationStudioActionDeclarationError } from "../index.ts";

it("keeps empty observing declarations distinct from missing or unreadable declarations", () => {
  const observed = readAutomationStudioActionDeclaration({ consequences: [], control: { name: "Actual operation" }, verb: "inspect", effect: "observe" });
  expect(automationStudioActionPermissionProjection(observed)).toEqual({ effect: "observe", consequences: [], disregarded: [] });
  expect(() => readAutomationStudioActionDeclaration({ control: { name: "Actual operation" }, verb: "inspect" })).toThrow(AutomationStudioActionDeclarationError);
  expect(() => readAutomationStudioActionDeclaration({ consequences: ["unknown"], control: { name: "Actual operation" }, verb: "inspect" })).toThrow("consequence_unrecognised");
});

it("cannot lower a commit floor or drop its consequences through legacy observing fields", () => {
  const read = readAutomationStudioActionDeclaration({ consequences: [], effect: "observe", control: { name: "Actual operation", resource: "opaque:resource" }, verb: "perform", actionEffect: { effectClass: "commit", permissionConsequences: ["delete"] } });
  expect(read.controlResource).toBe("opaque:resource");
  expect(automationStudioActionPermissionProjection(read)).toEqual({ effect: "mutate", consequences: ["delete"], disregarded: [] });
  expect(() => readAutomationStudioActionDeclaration({ consequences: [], control: { name: "Actual operation" }, verb: "perform", actionEffect: { effectClass: "commit", permissionConsequences: [], repeatSafe: true } })).toThrow("action_effect_invalid");
});
