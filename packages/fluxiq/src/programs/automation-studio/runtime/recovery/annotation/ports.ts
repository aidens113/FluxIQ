// What the recovery path needs from the service, declared as ports rather than
// taken from a `this`.
//
// The whole of stage A through stage D used to be one 313-line private method
// on `AutomationStudioService`, which meant two things. The file it lived in
// was frozen at its own line count, so every later stage of the loop had to be
// argued for against a budget rather than on its merits. And nothing could
// drive the path in a test without standing up a service, a project directory
// and a run, so the only assertions anyone wrote about it were about the four
// pure functions it called.
//
// Naming the eight things it actually uses fixes both. They are ports, not a
// service handle: each one is the narrowest signature the path calls, so a test
// supplies eight small functions and the service supplies eight bound methods.

import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowChangeProposal,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowScope
} from "../../../model/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type {
  AutomationStudioLlmProviderResolution,
  AutomationStudioLlmProviderResolverInput,
  AutomationStudioReusableLlmContextFreshEvidenceInput,
  AutomationStudioRuntimeAdaptationContext
} from "../../service.ts";

/**
 * Everything the runtime recovery path reaches outside itself for.
 *
 * Optional members are written `?: T | undefined` deliberately: the service
 * holds them as optional fields, and under `exactOptionalPropertyTypes` a bare
 * `?: T` would refuse the field it already has.
 */
export type AutomationStudioRuntimeRecoveryPorts = {
  /** Resolves the provider for this project and Flow, or nothing when none is configured. */
  resolveLlmProvider?: ((input: AutomationStudioLlmProviderResolverInput) =>
    | AutomationStudioLlmProviderResolution
    | AutomationStudioLlmProvider
    | undefined
    | Promise<AutomationStudioLlmProviderResolution | AutomationStudioLlmProvider | undefined>) | undefined;
  /** The domain bound to this host: its evidence keys, its options, its refusals. */
  llmEvidenceRuntime?: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
  reusableLlmContextEnabled: boolean;
  flowInstructionSet(input: { projectId: string; flowId?: string; subflowId?: string }): Promise<AutomationStudioFlowInstruction[]>;
  reusableLlmContextForFreshEvidence(
    input: AutomationStudioReusableLlmContextFreshEvidenceInput & { optedIn: boolean; maxInputTokens: number; actorId?: string; now?: number }
  ): Promise<{ packet?: AutomationStudioReusableLlmContextPacket; metadata: JsonObject } | undefined>;
  /**
   * The Flow as recovery reads it: where it is authored, which decides which
   * harness options the exploration may be offered, and its stored metadata,
   * which holds what its build recorded about it. This is the parent Flow; the
   * subflow graph that ran carries neither.
   *
   * It answers `undefined` when the Flow cannot be read. That is not the same
   * as "anywhere": an exploration with no scope is not run at all, and the
   * trace records that the plan asked for one and none happened.
   */
  flowForRecovery(projectId: string, flowId: string): Promise<{ scope: AutomationStudioFlowScope; metadata?: JsonObject | undefined } | undefined>;
  saveFlowChangeProposal(proposal: AutomationStudioFlowChangeProposal): Promise<AutomationStudioFlowChangeProposal>;
  saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation>;
  promoteRuntimeAdaptation(input: {
    adaptation: AutomationStudioFlowAdaptation;
    context: AutomationStudioRuntimeAdaptationContext;
  }): Promise<AutomationStudioFlowAdaptation>;
};
