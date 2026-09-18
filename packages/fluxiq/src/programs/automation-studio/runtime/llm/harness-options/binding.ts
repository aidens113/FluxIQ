// The bridge from the one mutable slot to the registry.
//
// Until now a host bound a single `llmEvidenceRuntime` object: a bare list of
// tools, an executor, and two optional callbacks, with no domain id, no merge
// and no gate. The whole object was handed to the loop unfiltered, so the last
// bind won and Core could not say whose tools those were.
//
// The slot keeps working. It gains one required field -- the domain it belongs
// to -- and is adapted here into an ordinary domain bundle, so a host that
// changes nothing else keeps its three tools and gains the gate, and Core's
// own options appear beside them as soon as a host port is bound.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
import type { AutomationStudioExplorationRefusalClassifier, AutomationStudioExplorationStateDigestPhase } from "../../recovery/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import type { AutomationStudioLlmFailureEvidenceCaptureInput, AutomationStudioRuntimeTargetOverrideTarget } from "../harness.ts";
import type { AutomationStudioHarnessOptionHost } from "./host.ts";
import type { AutomationStudioHarnessOption, AutomationStudioHarnessOptionBundle, AutomationStudioHarnessOptionImplementation } from "./option.ts";
import { AutomationStudioHarnessOptionRegistry } from "./registry.ts";

/**
 * What a host binds to give the loop its domain's actions.
 *
 * `domainId` is the field the slot never had, and everything the registry does
 * about scoping follows from it.
 */
export type AutomationStudioLlmEvidenceRuntimeBinding = {
  domainId: string;
  /**
   * Keys that may never appear in the failure evidence or the reusable context
   * this domain produces, because for its medium they carry raw payload or
   * something the model could execute or address directly.
   *
   * Core used to hold this list itself, naming `html`, `cookies`, `headers` and
   * the rest -- a browser's and an HTTP client's vocabulary inside a framework
   * that must have neither, which also enforced nothing for a domain whose raw
   * payload goes by another name. The only party that knows what raw payload
   * looks like is the domain, so the domain declares it. Core still bounds
   * depth, size and shape whatever is declared.
   *
   * Required, and deliberately so. An absent field used to mean "deny nothing",
   * so a domain that simply forgot got no protection at all and nothing said
   * so. Declaring `[]` is a domain stating it has nothing of the sort, which a
   * reviewer can see and argue with; an absent field is not. Core's packet
   * builder refuses to carry evidence or reusable context that arrives with no
   * declaration at all, so the compile-time rule and the run-time rule agree.
   */
  deniedEvidenceKeys: readonly string[];
  tools: AutomationStudioLlmEvidenceTool[];
  /**
   * Options the domain declares in full, rather than as bare tools. Unlike
   * `tools`, these carry their own availability, safety and stages, so a
   * runtime-only option never reaches Flow authoring.
   */
  harnessOptions?: AutomationStudioHarnessOptionBundle;
  /**
   * How this domain reads a tool result code that means "the harness declined
   * to act", so the exploration runner can stop on a refusal without Core
   * knowing any of the domain's result codes.
   */
  classifyRefusal?: AutomationStudioExplorationRefusalClassifier;
  executeTool(input: {
    projectId: string;
    flowId: string;
    callId: string;
    toolId: string;
    value: JsonObject;
    maxEvidenceBytes: number;
    signal?: AbortSignal;
  }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /**
   * What the state was at one moment, as an opaque digest Core only ever
   * compares for equality.
   *
   * Asked once before each exploration action and once after it, and it is the
   * one input a reduction of that exploration cannot be computed without: Core
   * knows which action ran and what it returned, and nothing at all about
   * whether the world changed. The contract the answer must satisfy -- stable
   * across a step that changed nothing the automation depends on, different
   * after a step that did -- is stated in full beside the type, in
   * `runtime/recovery/exploration-state/digest-source.ts`.
   *
   * Optional, because a domain that has no way to observe its own state should
   * say nothing rather than invent a digest: an exploration with no digests is
   * simply not reduced, and says so. What it must never be is a digest of the
   * evidence the step returned, which is what the step said rather than what
   * the world was.
   */
  captureStateDigest?(input: {
    projectId: string;
    flowId: string;
    callId: string;
    toolId: string;
    phase: AutomationStudioExplorationStateDigestPhase;
    signal?: AbortSignal;
  }): Promise<string | undefined>;
  captureSanitizedFailureEvidence?(input: AutomationStudioLlmFailureEvidenceCaptureInput): Promise<JsonObject | undefined>;
  /**
   * Judge a repair target against one packet this domain issued, and resolve it.
   *
   * `evidence` is exactly one packet the patch request showed the model: the
   * failure packet, or a packet one of this domain's exploration options
   * returned during the same recovery. Core asks about the one packet the
   * target's handles came from and passes the handles as this domain issued
   * them; Core's own `<evidenceId>:` qualifier, which says which explored
   * packet a handle came from, is removed first. A target whose handles come
   * from more than one packet, or name an explored packet the request did not
   * carry, is refused by Core without asking. So a domain that numbers its
   * handles per packet needs nothing new: each call is one packet, as before.
   *
   * `matched` means the target stands as it was passed here, without the
   * qualifier. Every call is guarded: a throw is read as `absent`.
   */
  validateTargetOverrideEvidence?(
    evidence: JsonObject,
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ): AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  /**
   * Turn a generated plan node's parameters into the ones it really runs with,
   * or refuse the node.
   *
   * The model names what it observed only by the handles this domain issued in
   * its evidence, written as `{ "handle": "<token>" }` where a real value --
   * a target, an extraction item -- belongs. After exploration and before the
   * plan is validated, Core calls this once for every node of the plan, with a
   * copy of the node's parameters as the model wrote them.
   *
   * - `unchanged`: the parameters stand as written. Right for a node this
   *   domain does not own, or one that names no handle.
   * - `resolved`: the node's complete parameters, every handle reference
   *   replaced from the resolutions the domain retained when it issued them.
   * - `refused`: the node cannot run as written -- a handle this domain never
   *   issued, one that no longer points at anything, or anything else the
   *   domain will not accept. Issue codes only (`^[a-z0-9_.:-]{1,100}$`).
   *
   * Core trusts none of the answer. A throw, a malformed answer, parameters
   * that are not plain bounded JSON, or parameters that still name a handle
   * (including `unchanged` ones) all refuse the node, and so does naming a
   * handle when this is not implemented. A refused node fails plan validation
   * and never reaches dispatch.
   */
  resolvePlanNodeParameters?(input: {
    projectId: string;
    flowId: string;
    nodeDefinitionId: string;
    parameters: JsonObject;
  }): { status: "unchanged" } | { status: "resolved"; parameters: JsonObject } | { status: "refused"; issueCodes: readonly string[] };
};

/**
 * The registry for one host: Core's own options for whatever host port is
 * bound, extended by the bound domain's own. Either half may be absent, which
 * is how a host that binds nothing behaves exactly as it did before.
 */
export function automationStudioHarnessOptionRegistry(input: {
  // Explicitly `| undefined` so a caller can pass its own optional field
  // straight through under exactOptionalPropertyTypes.
  host?: AutomationStudioHarnessOptionHost | undefined;
  binding?: AutomationStudioLlmEvidenceRuntimeBinding | undefined;
}): AutomationStudioHarnessOptionRegistry {
  const registry = new AutomationStudioHarnessOptionRegistry(input.host ? { host: input.host } : {});
  if (input.binding && (input.binding.tools.length || input.binding.harnessOptions?.options.length)) {
    registry.register(automationStudioHarnessOptionBundleFromBinding(input.binding));
  }
  return registry;
}

/**
 * A harness input carrying the bound domain's declared denied keys.
 *
 * Flow Bootstrap assembles its own harness input and never forwarded them, so
 * its reusable context reached the model with only Core's own `target` family
 * denied and none of the domain's raw-payload nouns -- silently, because an
 * absent declaration used to mean "deny nothing". Forwarded, never defaulted:
 * a `?? []` in this position would restore exactly the default-open that
 * making the declaration required exists to close.
 */
export function automationStudioHarnessInputWithDeniedEvidenceKeys<Input extends { deniedEvidenceKeys?: readonly string[] }>(
  input: Input,
  binding: AutomationStudioLlmEvidenceRuntimeBinding | undefined
): Input {
  if (!binding) return input;
  return { ...input, deniedEvidenceKeys: binding.deniedEvidenceKeys };
}

/** One domain's bound tools as a bundle the registry can hold. */
export function automationStudioHarnessOptionBundleFromBinding(binding: AutomationStudioLlmEvidenceRuntimeBinding): AutomationStudioHarnessOptionBundle {
  const implementations: Record<string, AutomationStudioHarnessOptionImplementation> = {};
  const options = binding.tools.map((tool) => {
    implementations[tool.toolId] = executionFor(binding, tool.toolId);
    return scopedOption(tool, binding.domainId);
  });
  const declared = binding.harnessOptions;
  if (declared) {
    if (declared.domainId !== binding.domainId) {
      throw new Error(`Automation Studio harness options declare domain "${declared.domainId}" on a runtime bound for "${binding.domainId}".`);
    }
    for (const option of declared.options) {
      const implementation = declared.implementations[option.toolId];
      if (!implementation) throw new Error(`Automation Studio harness option "${option.toolId}" has no implementation.`);
      options.push(option);
      implementations[option.toolId] = implementation;
    }
  }
  return { schemaVersion: "0.1", domainId: binding.domainId, options, implementations };
}

function scopedOption(tool: AutomationStudioLlmEvidenceTool, domainId: string): AutomationStudioHarnessOption {
  return {
    toolId: tool.toolId,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.effect !== undefined ? { effect: tool.effect } : {}),
    ...(tool.repeatPolicy !== undefined ? { repeatPolicy: tool.repeatPolicy } : {}),
    ...(tool.initialObservation !== undefined ? { initialObservation: tool.initialObservation } : {}),
    availability: { kind: "domain", domainId },
    // The slot never declared a side effect, so it is read off what the loop
    // already tracks. A domain that wants a narrower or wider declaration says
    // so by registering a bundle of its own instead of using the slot.
    safety: { sideEffect: tool.effect === "mutate" ? "mutate" : "observe" }
  };
}

function executionFor(binding: AutomationStudioLlmEvidenceRuntimeBinding, toolId: string): AutomationStudioHarnessOptionImplementation {
  return (input) => binding.executeTool({
    projectId: input.projectId,
    flowId: input.flowId,
    callId: input.callId,
    toolId,
    value: input.value,
    maxEvidenceBytes: input.maxEvidenceBytes,
    ...(input.signal !== undefined ? { signal: input.signal } : {})
  });
}
