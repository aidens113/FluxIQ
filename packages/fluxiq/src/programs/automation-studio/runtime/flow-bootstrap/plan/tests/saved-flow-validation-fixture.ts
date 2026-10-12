// A plan as the Flow it is saved as, held to the Flow's own validation (t388).
//
// The plan validator proves the plan is one the registry can build; it does
// not know what a saved Flow graph must say about its handlers, entries and
// checkpoints. That is `model/validation/flow.ts`'s (C4), which reads each
// graph with its Subflow's role and every checkpoint the automation declares.
// So a test that assembles a state-aware script runs it through both: the plan
// validator, then `normalizeAutomationStudioFlowBuildPlan` -- the topology
// apply saves -- and the Flow validator on each graph.
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../../nodes/index.ts";
import { createBlankAutomationStudioFlowArtifact, validateAutomationStudioFlow, type AutomationStudioValidationIssue } from "../../../../model/index.ts";
import { normalizeAutomationStudioFlowBuildPlan, type AutomationStudioBootstrapTopology } from "../../adaptation.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapIssue, type AutomationStudioFlowBootstrapPlan } from "../index.ts";

/** Every error the plan validator, or the Flow validator on a saved graph, raises for a plan; and the topology, when the plan validated. */
export function savedFlowValidation(plan: AutomationStudioFlowBootstrapPlan, registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): {
  errors: Array<AutomationStudioFlowBootstrapIssue | (AutomationStudioValidationIssue & { graph: string })>;
  topology?: AutomationStudioBootstrapTopology;
} {
  const validation = validateAutomationStudioFlowBootstrapPlan({ plan, registry, resolution });
  const planErrors = validation.issues.filter((issue) => issue.severity === "error");
  if (!validation.validated) return { errors: planErrors };
  const parentFlow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.state", projectId: "project.state", name: "State-aware Flow", now: 1 });
  const topology = normalizeAutomationStudioFlowBuildPlan({ adaptationId: "adaptation.bootstrap.state", parentFlow, buildPlan: validation.validated, sourceInstructionIds: [], now: 1 });
  const checkpointIds = topology.subflows.flatMap((entry) => entry.graphFlow.nodes.flatMap((node) => {
    const checkpoint = node.metadata?.["fluxiq.checkpoint"];
    return checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint) && typeof checkpoint.id === "string" ? [checkpoint.id] : [];
  }));
  const flowErrors = topology.subflows.flatMap((entry) => validateAutomationStudioFlow(entry.graphFlow, { subflowRole: entry.subflow.role, externalCheckpointIds: checkpointIds }).issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({ ...issue, graph: String(entry.subflow.metadata?.bootstrapSymbolicKey ?? entry.subflow.subflowId) })));
  return { errors: [...planErrors, ...flowErrors], topology };
}
