import type { AutomationStudioFlowArtifact, AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { resolveAutomationStudioLlmInstructions } from "../../llm/index.ts";
import { emitAutomationStudioBuildRequest } from "../../activity/index.ts";
import { automationStudioFlowBootstrapSizeLimitsOf, buildAutomationStudioFlowBootstrapContext, flowBootstrapPhaseFailure } from "../../flow-bootstrap/index.ts";

/** Shared immutable instruction/catalog context for legacy proposals and explicit candidates. */
export function automationStudioFlowBootstrapGenerationContext(input: {
  projectId: string;
  flowId: string;
  instructions: AutomationStudioFlowInstruction[];
  parent: AutomationStudioFlowArtifact;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}) {
  const resolvedInstructions = resolveAutomationStudioLlmInstructions({ instructions: input.instructions, projectId: input.projectId, flowId: input.flowId });
  if (!resolvedInstructions.instructions.length || resolvedInstructions.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.active_instructions_required");
  const size = automationStudioFlowBootstrapSizeLimitsOf(input.parent);
  const bootstrapInstructionText = resolvedInstructions.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  emitAutomationStudioBuildRequest(resolvedInstructions.instructions);
  const bootstrapContext = buildAutomationStudioFlowBootstrapContext({ registry: input.registry, resolution: input.resolution, size, instructionText: bootstrapInstructionText });
  if (!bootstrapContext.nodeCatalog.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.node_catalog_unavailable");
  if (bootstrapContext.catalogSelection.missingRequiredTerms.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.required_capabilities_unavailable");
  return { resolvedInstructions, size, bootstrapInstructionText, bootstrapContext };
}
