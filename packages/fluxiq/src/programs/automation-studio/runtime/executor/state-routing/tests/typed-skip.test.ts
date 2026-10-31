import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationNodeStateBinding, resolveAutomationStudioNodeActionEffect, type AutomationStudioNodeDefinition, type AutomationStudioResolvedActionEffect } from "../../../../nodes/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioNotShownAttempt, automationStudioStateRouteGuard, decideAutomationStudioStateRoute } from "../index.ts";

type Options = Pick<AutomationStudioGraphExecutionOptions, "hostRuntime" | "resolveActionEffect" | "inputs">;
const commit: AutomationStudioResolvedActionEffect = { effectClass: "commit", permissionConsequences: [] };

function optional(parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode {
  return {
    id: "same",
    definitionId: "example.conditional",
    label: "No thanks",
    parameterValues,
    metadata: { sometimesPresent: true, effect: "observe", idempotent: true, declaredConsequences: [], routeSignatures: { effect: { changed: true } } }
  };
}

function flowOf(node: AutomationStudioFlowNode): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "typed.skip",
    ownerKind: "routine",
    ownerId: "typed.skip",
    name: "Typed skip",
    createdAt: 1,
    updatedAt: 1,
    nodes: [node, { id: "next", definitionId: "builtin.control.end" }],
    edges: [{ id: "same-next", sourceNodeId: "same", sourcePortId: "success", targetNodeId: "next", targetPortId: "in" }]
  };
}

function decide(node: AutomationStudioFlowNode, options: Options, attempt = automationStudioNotShownAttempt(node, "same.attempt", 1)) {
  return decideAutomationStudioStateRoute({ flow: flowOf(node), node, attempt, attempts: [], options, guard: automationStudioStateRouteGuard() });
}

describe("typed optional skip truth at the routing boundary", () => {
  it("annotates a known committing dismissal without turning its declared way on into a failure", async () => {
    const result = await decide(optional(), { resolveActionEffect: () => commit });
    expect(result).toMatchObject({ kind: "declared", edge: { targetNodeId: "next" }, notDone: true });
  });

  it("reads current raw slots for every same-id pass in both class orders, including unresolved false fallbacks", async () => {
    const definition: Pick<AutomationStudioNodeDefinition, "actionEffect" | "parameters"> = {
      actionEffect: { effectClass: "state", commitWhen: "submit" },
      parameters: [{ id: "submit", label: "Submit", valueType: "boolean", defaultValue: false }]
    };
    const bound = automationNodeStateBinding("loop.item", false);
    for (const order of [[true, false], [false, true]]) {
      const values = [...order.map((submit) => ({ submit })), { submit: bound }, {}];
      const seen: Array<Readonly<Record<string, unknown>> | undefined> = [];
      const options: Options = {
        inputs: { "loop.item": false },
        resolveActionEffect: (_node, raw) => {
          seen.push(raw);
          return resolveAutomationStudioNodeActionEffect(definition, raw);
        }
      };
      const notDone: boolean[] = [];
      for (const raw of values) {
        const result = await decide(optional(raw), options);
        expect(result.kind).toBe("declared");
        notDone.push(result.kind === "declared" && result.notDone === true);
        expect(seen.at(-1)).toBe(raw);
      }
      expect(notDone).toEqual([...order, true, false]);
      expect(seen[2]?.submit).toBe(bound);
    }
  });

  it("accepts only literal positive own-effect evidence, retaining notDone for absent, failed or malformed witnesses", async () => {
    for (const answer of [true, false, undefined, "true", 1, "throws"] as unknown[]) {
      let observations = 0;
      let checks = 0;
      const hostRuntime: NonNullable<Options["hostRuntime"]> = {
        capabilities: [],
        observeRouteState: () => {
          observations += 1;
          return { changed: true };
        },
        routeEffectHolds: () => {
          checks += 1;
          if (answer === "throws") throw new Error("Witness unavailable.");
          return answer as boolean;
        }
      };
      const result = await decide(optional(), { hostRuntime, resolveActionEffect: () => commit });
      expect(observations).toBe(1);
      expect(checks).toBe(1);
      if (answer === true) {
        expect(result).toMatchObject({ kind: "routed", record: { outcome: "effect_holds" } });
        expect(result).not.toHaveProperty("notDone");
      } else {
        expect(result).toMatchObject({ kind: "declared", notDone: true });
      }
    }
  });

  it("does not let a positive route witness bypass an ambiguous or settled target failure", async () => {
    const node = optional();
    const unacted = automationStudioNotShownAttempt(node, "same.attempt", 1);
    const ambiguous: AutomationStudioNodeAttemptTrace = { ...unacted, failure: { ...unacted.failure!, effect: "ambiguous" } };
    let observations = 0;
    const options: Options = {
      resolveActionEffect: () => commit,
      hostRuntime: {
        capabilities: [],
        observeRouteState: () => {
          observations += 1;
          return { changed: true };
        },
        routeEffectHolds: () => true
      }
    };
    for (const attempt of [ambiguous, { ...unacted, effectCheck: { result: "landed" as const, checkedAt: 2 } }, { ...unacted, effectCheck: { result: "unknown" as const, checkedAt: 2 } }]) {
      expect(await decide(node, options, attempt)).toMatchObject({ kind: "none", record: { outcome: "no_match" } });
    }
    expect(observations).toBe(0);
    const settled: AutomationStudioNodeAttemptTrace = { ...ambiguous, effectCheck: { result: "not_landed", checkedAt: 3 } };
    expect(await decide(node, options, settled)).toMatchObject({ kind: "routed", record: { outcome: "effect_holds" } });
    expect(observations).toBe(1);
  });

  it("never treats a malformed callback or a failed lookup as an absent legacy floor", async () => {
    const malformed: unknown[] = [null, false, { effectClass: "observe" }];
    for (const floor of malformed) {
      await expect(decide(optional(), { resolveActionEffect: () => floor as AutomationStudioResolvedActionEffect })).rejects.toThrow();
    }
    await expect(decide(optional(), { resolveActionEffect: () => { throw new Error("Lookup refused."); } })).rejects.toThrow("Lookup refused.");
  });
});
