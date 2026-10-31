import { describe, expect, it } from "vitest";
import { resolveAutomationStudioNodeActionEffect, type AutomationStudioNodeActionEffect } from "../index.ts";
import type { AutomationNodeParameter } from "../../index.ts";

function conditional(defaultValue?: boolean) {
  const parameter: AutomationNodeParameter = {
    id: "apply",
    label: "Apply",
    valueType: "boolean",
    ...(defaultValue !== undefined ? { defaultValue } : {})
  };
  const actionEffect: AutomationStudioNodeActionEffect = { effectClass: "state", commitWhen: "apply" };
  return { actionEffect, parameters: [parameter] };
}

describe("a canonical action-effect floor", () => {
  it("keeps old clients absent and resolves each unconditional class without inventing consequences", () => {
    expect(resolveAutomationStudioNodeActionEffect({ parameters: [] })).toBeUndefined();
    for (const effectClass of ["observe", "state", "commit"] as const) {
      expect(resolveAutomationStudioNodeActionEffect({ parameters: [], actionEffect: { effectClass } })).toEqual({ effectClass, permissionConsequences: [] });
    }
  });

  it("uses a trusted false default only for an absent value, and explicit booleans override it", () => {
    expect(resolveAutomationStudioNodeActionEffect(conditional(false))?.effectClass).toBe("state");
    expect(resolveAutomationStudioNodeActionEffect(conditional(true))?.effectClass).toBe("commit");
    expect(resolveAutomationStudioNodeActionEffect(conditional())?.effectClass).toBe("commit");
    expect(resolveAutomationStudioNodeActionEffect(conditional(true), { apply: false })?.effectClass).toBe("state");
    expect(resolveAutomationStudioNodeActionEffect(conditional(false), { apply: true })?.effectClass).toBe("commit");
  });

  it("never treats a binding, invalid value or explicit undefined as proven false", () => {
    for (const apply of [undefined, null, 0, "false", {}, { $state: { path: "unknown", fallback: false } }]) {
      expect(resolveAutomationStudioNodeActionEffect(conditional(false), { apply })?.effectClass).toBe("commit");
    }
  });

  it("keeps the commit floor above model observation, idempotency and empty consequences claims", () => {
    const definition = {
      parameters: [],
      actionEffect: { effectClass: "commit" as const },
      metadata: { effect: "observe", idempotent: true, consequences: [], actionEffect: { effectClass: "observe" } }
    };
    expect(resolveAutomationStudioNodeActionEffect(definition, { effect: "observe", idempotent: true, consequences: [], actionEffect: { effectClass: "observe" } })).toEqual({ effectClass: "commit", permissionConsequences: [] });
    const legacyOnly = { parameters: [], metadata: definition.metadata };
    expect(resolveAutomationStudioNodeActionEffect(legacyOnly)).toBeUndefined();
  });

  it("retains and orders known client classes independently of a false commit predicate", () => {
    const definition = conditional(false);
    definition.actionEffect.permissionConsequences = ["create_new", "delete", "delete"];
    expect(resolveAutomationStudioNodeActionEffect(definition, { apply: false })).toEqual({ effectClass: "commit", permissionConsequences: ["delete", "create_new"] });
    expect(resolveAutomationStudioNodeActionEffect({ parameters: [], actionEffect: { effectClass: "observe", permissionConsequences: ["modify_existing"] } })).toEqual({ effectClass: "commit", permissionConsequences: ["modify_existing"] });
  });

  it("does not let a false predicate lower an unconditional commit or mutate the definition", () => {
    const definition = conditional(false);
    definition.actionEffect.effectClass = "commit";
    definition.actionEffect.permissionConsequences = ["delete"];
    const before = structuredClone(definition);
    const resolved = resolveAutomationStudioNodeActionEffect(definition, { apply: false });
    expect(resolved).toEqual({ effectClass: "commit", permissionConsequences: ["delete"] });
    expect(definition).toEqual(before);
    expect(resolved?.permissionConsequences).not.toBe(definition.actionEffect.permissionConsequences);
  });
});
