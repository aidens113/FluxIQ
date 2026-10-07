import type { AutomationStudioFlowArtifact, AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import { resolveAutomationStudioLlmInstructions } from "../../llm/index.ts";
import { emitAutomationStudioBuildRequest } from "../../activity/index.ts";
import { automationStudioFlowBootstrapSizeLimitsOf, buildAutomationStudioFlowBootstrapContext, flowBootstrapPhaseFailure } from "../../flow-bootstrap/index.ts";
import { AutomationStudioCandidateSource, type AutomationStudioCandidateOriginalSourceOutcome } from "../candidate-drafts/index.ts";
import { automationStudioCandidateFingerprint } from "../../flow-bootstrap/candidate/index.ts";

/** Shared immutable instruction/catalog context for legacy proposals and explicit candidates. */
export function automationStudioFlowBootstrapGenerationContext(input: {
  projectId: string;
  flowId: string;
  instructions: AutomationStudioFlowInstruction[];
  parent: AutomationStudioFlowArtifact;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  originalInstructionInventory?: { instructionIds: readonly string[] };
}) {
  const inventory = Object.getOwnPropertyDescriptor(input, "originalInstructionInventory");
  const instructions = inventory ? automationStudioCandidateFingerprint.snapshot(input.instructions) : input.instructions;
  const resolvedInstructions = resolveAutomationStudioLlmInstructions({ instructions, projectId: input.projectId, flowId: input.flowId });
  let originalSource: AutomationStudioCandidateOriginalSourceOutcome = { status: "unknown", code: "candidate.original_inventory_unavailable" };
  if (inventory) {
    try {
      if (!Object.hasOwn(inventory, "value") || inventory.value === undefined) throw new Error("candidate.original_inventory_invalid");
      const expected = automationStudioCandidateFingerprint.snapshot(inventory.value as { instructionIds: readonly string[] });
      if (Object.keys(expected).length !== 1 || !Object.hasOwn(expected, "instructionIds")) throw new Error("candidate.original_inventory_invalid");
      originalSource = { status: "bound", binding: AutomationStudioCandidateSource.capture({ projectId: input.projectId, flowId: input.flowId, inventoryInstructionIds: expected.instructionIds, instructions, resolution: resolvedInstructions }) };
    } catch { throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.active_instructions_required"); }
  }
  if (!resolvedInstructions.instructions.length || resolvedInstructions.diagnostics.some((diagnostic) => diagnostic.severity === "error")) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.active_instructions_required");
  const size = automationStudioFlowBootstrapSizeLimitsOf(input.parent);
  const bootstrapInstructionText = resolvedInstructions.instructions.map((instruction) => `${instruction.title}\n${instruction.body}`).join("\n");
  emitAutomationStudioBuildRequest(resolvedInstructions.instructions);
  const bootstrapContext = buildAutomationStudioFlowBootstrapContext({ registry: input.registry, resolution: input.resolution, size, instructionText: bootstrapInstructionText });
  if (!bootstrapContext.nodeCatalog.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.node_catalog_unavailable");
  if (bootstrapContext.catalogSelection.missingRequiredTerms.length) throw flowBootstrapPhaseFailure("pre_provider_validation", undefined, "flow_bootstrap.required_capabilities_unavailable");
  return { resolvedInstructions, size, bootstrapInstructionText, bootstrapContext, originalSource };
}
