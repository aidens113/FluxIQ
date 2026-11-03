import {
  automationStudioProjectStructurePlan,
  automationStudioProjectTaskSpec,
  type AutomationStudioProjectBuilderReturn,
  type AutomationStudioProjectInstructionSource,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectSubflowBrief,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";

// A two-part task on a recipe site: one part reads, one part saves. Shaped
// unlike any Lab scenario on purpose.

export const SOURCE_TEXT = "Open the recipe archive and list the five newest soups. Then save the first one to my cookbook.";

export function sources(): AutomationStudioProjectInstructionSource[] {
  return [{ sourceId: "instruction.1", text: SOURCE_TEXT }];
}

export function taskSpec(change?: (spec: Omit<AutomationStudioProjectTaskSpec, "digest">) => void): AutomationStudioProjectTaskSpec {
  const spec: Omit<AutomationStudioProjectTaskSpec, "digest"> = {
    parts: [
      { id: "p1", quote: { sourceId: "instruction.1", text: "list the five newest soups" }, goalFacts: ["five soup names are listed"], lastingActs: [] },
      { id: "p2", quote: { sourceId: "instruction.1", text: "save the first one to my cookbook" }, goalFacts: ["the first soup is in the cookbook"], lastingActs: ["create_new"] }
    ],
    notAsked: ["rating any recipe"]
  };
  change?.(spec);
  return { parts: spec.parts, notAsked: spec.notAsked, digest: automationStudioProjectTaskSpec.digest(spec) };
}

export function structurePlan(change?: (plan: Omit<AutomationStudioProjectStructurePlan, "digest">) => void, spec: AutomationStudioProjectTaskSpec = taskSpec()): AutomationStudioProjectStructurePlan {
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: spec.digest,
    plan: {
      schemaVersion: "0.1",
      router: {
        name: "Recipes",
        rules: [{ key: "archive", name: "Archive", targetSubflowKey: "list_soups", routeTags: ["archive"], condition: { signalPath: "inputs.section", operator: "exists" } }],
        fallback: { kind: "subflow", targetSubflowKey: "list_soups" }
      },
      subflows: [
        { key: "list_soups", name: "List soups", role: "primary", nodes: [], edges: [], metadata: { "fluxiq.successCheck": [{ fact: "list", op: "count", value: 5 }] } },
        {
          key: "save_recipe",
          name: "Save recipe",
          role: "utility",
          nodes: [],
          edges: [],
          interface: { inputs: [{ id: "recipe", name: "Recipe", valueType: { kind: "unknown" }, required: true }], outputs: [] },
          metadata: { "fluxiq.successCheck": [{ fact: "saved", op: "exists" }] }
        }
      ]
    },
    partOf: { list_soups: ["p1"], save_recipe: ["p2"] }
  };
  change?.(plan);
  return { taskSpecDigest: plan.taskSpecDigest, plan: plan.plan, partOf: plan.partOf, digest: automationStudioProjectStructurePlan.digest(plan) };
}

export function brief(change?: (brief: AutomationStudioProjectSubflowBrief) => void, plan: AutomationStudioProjectStructurePlan = structurePlan()): AutomationStudioProjectSubflowBrief {
  const value: AutomationStudioProjectSubflowBrief = {
    briefId: "b1",
    kind: "build",
    planDigest: plan.digest,
    subflowKey: "save_recipe",
    parts: ["p2"],
    interface: { inputs: [{ id: "recipe", name: "Recipe", valueType: { kind: "unknown" }, required: true }], outputs: [] },
    entry: { caseId: "observed-current", predecessors: ["list_soups"] },
    allowanceUsd: 0.05,
    maxIterations: 20,
    permittedActs: ["create_new"]
  };
  change?.(value);
  return value;
}

export function builderReturn(change?: (returned: AutomationStudioProjectBuilderReturn) => void): AutomationStudioProjectBuilderReturn {
  const value: AutomationStudioProjectBuilderReturn = {
    briefId: "b1",
    outcome: "done",
    reason: "The recipe saves and its trial answered yes.",
    proposal: { subflowKey: "save_recipe", revision: 1, digest: "a".repeat(64) },
    trials: [{ kind: "subflow_trial", receiptId: "receipt.1", digest: "b".repeat(64) }],
    spentUsd: 0.02,
    calls: 5
  };
  change?.(value);
  return value;
}
