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
  AutomationStudioFlowRouter,
  AutomationStudioFlowScope
} from "../../../model/index.ts";
import type { AutomationStudioConversationTurn } from "../../conversations/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import type { AutomationStudioReusableLlmContextPacket } from "../../reusable-llm-context.ts";
import type { AutomationStudioUnattendedRepairAuthority } from "../../service/runtime-adaptation/index.ts";
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
  /**
   * The Flow's own standing authorization to repair itself with nobody
   * watching, redeemed.
   *
   * Asked **only** when the resolver above produced nothing, which in the
   * shipped host is every run carrying no execution grant: `_shared/runtime.ts`
   * resolves nothing without one, and the grant service refuses to issue one
   * without a live actor session. So a run nobody was watching could obtain no
   * model to produce a repair with, and a Flow that failed at three in the
   * morning stayed broken however capable the rest of the loop was.
   *
   * It answers with the redemption whether or not a model came of it, because a
   * refusal has to be recorded: "nobody authorized repairing this Flow", "the
   * authorization has expired" and "its ceiling is spent" are three different
   * things for a person to act on, and all three used to look alike -- like a
   * deployment with no model configured at all.
   *
   * Absent means this deployment resolves no standing models, which is a
   * configuration and not a refusal.
   */
  resolveUnattendedRepairAuthority?: (() => Promise<AutomationStudioUnattendedRepairAuthority>) | undefined;
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
  /**
   * The Flow's router, where its branching is actually written down.
   *
   * The Flow document carries nodes and edges; a router's rules live beside it
   * and reach the model nowhere else. A repair asked to author routing -- which
   * Core's own patch kinds permit, and which the standing requirement asks for
   * in repair as well as in creation -- was being shown a straight line and
   * could not tell a branch was there.
   *
   * It is the *parent* Flow's router that is read, whether or not a Subflow's
   * graph is the thing that ran: a Subflow graph has no router of its own, and
   * the rule that chose it is the parent's.
   *
   * Absent, or answering nothing, means this deployment has no router for the
   * Flow. That is ordinary -- a single-graph Flow has none -- and the section
   * simply carries nodes and edges.
   */
  flowRouterForRecovery?: ((projectId: string, flowId: string) => Promise<AutomationStudioFlowRouter | null | undefined>) | undefined;
  /**
   * The thread this run and this Flow are talked about in, in reading order.
   *
   * The conversation is FluxIQ's general channel to the person, so it is where
   * they will already have said the thing that explains a failure -- what they
   * actually meant by the instruction, an answer to a question the run asked,
   * a correction after seeing the last result. A repair that cannot read it is
   * repairing with the most informative evidence in the system withheld.
   *
   * Absent, or answering an empty list, means this deployment keeps no thread
   * for the run. That is a configuration, not a refusal, and the request simply
   * carries no conversation.
   */
  conversationForRecovery?: ((input: { projectId: string; flowId: string; runId: string }) => Promise<readonly AutomationStudioConversationTurn[]>) | undefined;
  saveFlowChangeProposal(proposal: AutomationStudioFlowChangeProposal): Promise<AutomationStudioFlowChangeProposal>;
  saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation>;
  promoteRuntimeAdaptation(input: {
    adaptation: AutomationStudioFlowAdaptation;
    context: AutomationStudioRuntimeAdaptationContext;
  }): Promise<AutomationStudioFlowAdaptation>;
};
