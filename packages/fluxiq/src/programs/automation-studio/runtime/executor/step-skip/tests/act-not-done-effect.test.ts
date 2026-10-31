import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationNodeStateBinding, resolveAutomationStudioNodeActionEffect, type AutomationStudioNodeDefinition, type AutomationStudioResolvedActionEffect } from "../../../../nodes/index.ts";
import { automationStudioSkippedStepDoesAct } from "../index.ts";

type Node = Parameters<typeof automationStudioSkippedStepDoesAct>[0];
const commit: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: [] };
const state: AutomationStudioResolvedActionEffect = { effectClass: "state", permissionConsequences: [], repeatSafe: true };
const observe: AutomationStudioResolvedActionEffect = { effectClass: "observe", permissionConsequences: [] };

describe("a skipped act's trusted client floor", () => {
  it.each(["No thanks", "Close", "Help", "Search", ""])("keeps a commit truthful under benign words %s and hostile safe claims", (label) => {
    const node: Node = { label, metadata: { effect: "observe", idempotent: true, repeatSafe: true, declaredConsequences: [], actionEffect: { effectClass: "observe" } } };
    expect(automationStudioSkippedStepDoesAct(node, commit)).toBe(true);
  });

  it("uses known minimum consequence classes even if the supplied class is lower", () => {
    expect(automationStudioSkippedStepDoesAct({ label: "Close" }, { effectClass: "observe", permissionConsequences: ["modify_existing"] })).toBe(true);
  });

  it.each([state, observe])("does not turn a known $effectClass into a lasting act from alarming words", (floor) => {
    expect(automationStudioSkippedStepDoesAct({ label: "Submit request", parameterValues: { element: { visibleText: "Claim voucher" } } }, floor)).toBe(false);
  });

  it("lets every explicit authored risk raise known state and observe floors", () => {
    const raised: Node[] = [
      { metadata: { declaredConsequences: ["modify_existing"] } },
      { metadata: { destructive: true } },
      { metadata: { externalSideEffect: true } },
      { metadata: { requiresApproval: true } },
      { parameterValues: { requiresApproval: true } },
      { metadata: { effect: "mutate" } },
      { parameterValues: { effect: "mutate" } }
    ];
    for (const node of raised) {
      for (const floor of [state, observe]) {
        expect(automationStudioSkippedStepDoesAct({ ...node, label: "No thanks" }, floor)).toBe(true);
      }
    }
  });

  it("retains the old control-before-label fallback without a contract, including metadata-bearing callers", () => {
    const metadata: NonNullable<AutomationStudioFlowNode["metadata"]> = { destructive: true, effect: "mutate", declaredConsequences: ["create_new"], actionEffect: { effectClass: "commit" } };
    const node: Node = {
      label: "Claim voucher",
      parameterValues: { element: { visibleText: "No thanks" } },
      metadata
    };
    expect(automationStudioSkippedStepDoesAct(node)).toBe(false);
    expect(automationStudioSkippedStepDoesAct({ ...node, parameterValues: {} })).toBe(true);
    expect(automationStudioSkippedStepDoesAct({ metadata })).toBe(false);
  });

  it("strictly rejects supplied malformed floors instead of falling back to words", () => {
    const malformed: unknown[] = [
      null,
      false,
      {},
      { effectClass: "observe" },
      { effectClass: "state", permissionConsequences: [], repeatSafe: false },
      { effectClass: "commit", permissionConsequences: [], repeatSafe: true },
      { effectClass: "observe", permissionConsequences: ["unrecognised"] },
      { effectClass: "observe", permissionConsequences: [], arbitrary: true }
    ];
    for (const floor of malformed) {
      expect(() => automationStudioSkippedStepDoesAct({ label: "No thanks" }, floor as AutomationStudioResolvedActionEffect)).toThrow();
    }
  });

  it("keeps conditional raw slots intact and remains conservative for unresolved bindings", () => {
    const definition: Pick<AutomationStudioNodeDefinition, "actionEffect" | "parameters"> = {
      actionEffect: { effectClass: "state", commitWhen: "submit", repeatSafe: true },
      parameters: [{ id: "submit", label: "Submit", valueType: "boolean", defaultValue: false }]
    };
    const cases: Array<[NonNullable<AutomationStudioFlowNode["parameterValues"]>, boolean]> = [
      [{ submit: true }, true],
      [{ submit: false }, false],
      [{}, false],
      [{ submit: automationNodeStateBinding("loop.item", false) }, true]
    ];
    for (const [parameterValues, notDone] of cases) {
      const floor = resolveAutomationStudioNodeActionEffect(definition, parameterValues);
      expect(automationStudioSkippedStepDoesAct({ label: "No thanks", parameterValues }, floor)).toBe(notDone);
    }
  });
});
