import { describe, expect, it } from "vitest";
import { combineAutomationStudioResolvedActionEffects, readAutomationStudioResolvedActionEffect, resolveAutomationStudioNodeActionEffect, type AutomationStudioNodeActionEffect } from "../index.ts";
import type { AutomationNodeParameter } from "../../index.ts";

const parameter: AutomationNodeParameter = { id: "submit", label: "Submit", valueType: "boolean", defaultValue: false };

describe("trusted repeat-safety declarations", () => {
  it("requires an explicit trusted promise rather than the state class or authored metadata", () => {
    const plain = { parameters: [], actionEffect: { effectClass: "state" as const }, metadata: { repeatSafe: true, idempotent: true } };
    expect(resolveAutomationStudioNodeActionEffect(plain)).toEqual({ effectClass: "state", permissionConsequences: [] });
    expect(resolveAutomationStudioNodeActionEffect({ parameters: [], actionEffect: { effectClass: "state", repeatSafe: true } })).toEqual({ effectClass: "state", permissionConsequences: [], repeatSafe: true });
  });

  it("retains safety only for a proven non-committing conditional value", () => {
    const definition = { parameters: [parameter], actionEffect: { effectClass: "state", commitWhen: "submit", repeatSafe: true } satisfies AutomationStudioNodeActionEffect };
    expect(resolveAutomationStudioNodeActionEffect(definition)).toEqual({ effectClass: "state", permissionConsequences: [], repeatSafe: true });
    expect(resolveAutomationStudioNodeActionEffect(definition, { submit: false })).toEqual({ effectClass: "state", permissionConsequences: [], repeatSafe: true });
    for (const submit of [true, undefined, null, { $state: { path: "unknown", fallback: false } }]) {
      expect(resolveAutomationStudioNodeActionEffect(definition, { submit })).toEqual({ effectClass: "commit", permissionConsequences: [] });
    }
  });

  it("lets known consequences raise a canonical definition and remove its safe promise", () => {
    const actionEffect: AutomationStudioNodeActionEffect = { effectClass: "state", repeatSafe: true, permissionConsequences: ["modify_existing"] };
    expect(resolveAutomationStudioNodeActionEffect({ parameters: [], actionEffect })).toEqual({ effectClass: "commit", permissionConsequences: ["modify_existing"] });
    expect(actionEffect.repeatSafe).toBe(true);
  });

  it("rejects malformed definitions and false or contradictory resolved promises", () => {
    for (const repeatSafe of [false, null, "true", 1]) {
      const definition = { parameters: [], actionEffect: { effectClass: "state" } satisfies AutomationStudioNodeActionEffect };
      Object.assign(definition.actionEffect, { repeatSafe });
      expect(() => resolveAutomationStudioNodeActionEffect(definition)).toThrow();
      expect(() => readAutomationStudioResolvedActionEffect({ effectClass: "state", permissionConsequences: [], repeatSafe })).toThrow();
    }
    expect(() => readAutomationStudioResolvedActionEffect({ effectClass: "commit", permissionConsequences: [], repeatSafe: true })).toThrow();
    expect(() => readAutomationStudioResolvedActionEffect({ effectClass: "state", permissionConsequences: ["delete"], repeatSafe: true })).toThrow();
    expect(() => resolveAutomationStudioNodeActionEffect({ parameters: [], actionEffect: { effectClass: "commit", repeatSafe: true } })).toThrow();
  });

  it("never lends a safe state contributor's promise to an unproven state or a commit", () => {
    const safe = readAutomationStudioResolvedActionEffect({ effectClass: "state", permissionConsequences: [], repeatSafe: true });
    const plain = readAutomationStudioResolvedActionEffect({ effectClass: "state", permissionConsequences: [] });
    const observe = readAutomationStudioResolvedActionEffect({ effectClass: "observe", permissionConsequences: [] });
    const commit = readAutomationStudioResolvedActionEffect({ effectClass: "commit", permissionConsequences: ["delete"] });
    expect(combineAutomationStudioResolvedActionEffects([safe, observe])).toEqual(safe);
    expect(combineAutomationStudioResolvedActionEffects([safe, plain])).toEqual(plain);
    expect(combineAutomationStudioResolvedActionEffects([safe, commit])).toEqual(commit);
    expect(combineAutomationStudioResolvedActionEffects([safe, safe])).toEqual(safe);
  });
});
