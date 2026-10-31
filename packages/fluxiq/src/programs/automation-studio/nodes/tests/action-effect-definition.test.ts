import { describe, expect, it } from "vitest";
import {
  AutomationStudioNodeRegistry,
  resolveAutomationStudioNodeActionEffect,
  validateAutomationStudioNodeDefinition,
  type AutomationStudioNodeDefinition
} from "../index.ts";

function node(): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1",
    id: "example.apply",
    version: "1.0.0",
    label: "Apply",
    description: "Apply a pending change.",
    category: "custom",
    source: { kind: "importer", domainId: "example", implementationKey: "apply" },
    availability: { kind: "domain", domainId: "example" },
    capabilities: { executable: true },
    inputs: [],
    outputs: [],
    parameters: [{ id: "apply", label: "Apply", valueType: "boolean", defaultValue: false }],
    actionEffect: { effectClass: "state", commitWhen: "apply", permissionConsequences: ["modify_existing"] }
  };
}

describe("action effects on canonical definitions", () => {
  it("survives a structured clone, JSON serialization and manifest registration", () => {
    const original = node();
    const restored: AutomationStudioNodeDefinition = JSON.parse(JSON.stringify(structuredClone(original)));
    const registry = new AutomationStudioNodeRegistry([]).registerImporterManifest({ schemaVersion: "0.1", domainId: "example", nodes: [restored] });
    const registered = registry.get(original.id);
    expect(registered?.actionEffect).toEqual(original.actionEffect);
    expect(registered && resolveAutomationStudioNodeActionEffect(registered, { apply: false })).toEqual({ effectClass: "commit", permissionConsequences: ["modify_existing"] });
  });

  it("refuses malformed contracts at registration rather than silently dropping fields", () => {
    for (const actionEffect of [
      null,
      { effectClass: "mutate" },
      { effectClass: "commit", permissionConsequences: ["delete", "purchase"] },
      { effectClass: "state", commitWhen: "unknown" },
      { effectClass: "state", commitWhen: " apply " },
      { effectClass: "state", commitWhen: false },
      { effectClass: "state", idempotent: true }
    ]) {
      const malformed = node();
      Object.assign(malformed, { actionEffect });
      expect(validateAutomationStudioNodeDefinition(malformed).issues.map((issue) => issue.code)).toEqual(["node.invalid_action_effect"]);
      expect(() => new AutomationStudioNodeRegistry([]).register(malformed)).toThrow("node.invalid_action_effect");
    }
  });

  it("requires the predicate parameter and its default to be boolean", () => {
    const nonBoolean = node();
    nonBoolean.parameters = [{ id: "apply", label: "Apply", valueType: "string", defaultValue: "false" }];
    expect(validateAutomationStudioNodeDefinition(nonBoolean).issues.map((issue) => issue.code)).toEqual(["node.invalid_action_effect"]);
    const wrongDefault = node();
    wrongDefault.parameters[0]!.defaultValue = "false";
    expect(validateAutomationStudioNodeDefinition(wrongDefault).issues.map((issue) => issue.code)).toEqual(["node.invalid_action_effect"]);
  });
});
