// The registry of harness options: what the exploration loop is allowed to do,
// and who is allowed to add to it.
//
// This is the scoping the loop never had. Before it, one mutable slot held one
// domain's tools, with no domain id, no merge and no gate, and the whole slot
// was handed to the loop unfiltered. The node registry one directory away
// already solves the same problem, so this follows it rather than inventing a
// second pattern: the same availability vocabulary, the same capability and
// permission checks, and the same rule that a duplicate id throws -- which is
// what makes "a domain extends the core set" mechanical rather than a promise.
//
// Two things the node registry does not need are added here. Declarations and
// implementations are kept apart, so listing the options never hands out host
// code. And the list the model is shown is a projection of the declarations,
// because a provider rejects a tool carrying any key it does not know, so the
// gate metadata has to be dropped at the boundary rather than travel with it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowScope } from "../../../model/index.ts";
import type { AutomationStudioNodeAvailability } from "../../../nodes/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { builtinAutomationStudioHarnessOptions } from "./builtin.ts";
import type { AutomationStudioHarnessOptionHost } from "./host.ts";
import {
  AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT,
  automationStudioHarnessOptionIssues,
  automationStudioHarnessOptionTool,
  type AutomationStudioHarnessOption,
  type AutomationStudioHarnessOptionBundle,
  type AutomationStudioHarnessOptionExecution,
  type AutomationStudioHarnessOptionImplementation,
  type AutomationStudioHarnessOptionStage
} from "./option.ts";

const DOMAIN_ID = /^[A-Za-z0-9._:-]{1,200}$/;

/**
 * Everything that decides which options this call may be offered. `scope`,
 * `runtimeCapabilities` and `permissions` are the node registry's resolution
 * unchanged; `stage`, `policy` and `approvedOptionIds` are the dimensions an
 * exploration call adds.
 */
export type AutomationStudioHarnessOptionResolution = {
  scope: AutomationStudioFlowScope;
  runtimeCapabilities?: Iterable<string>;
  permissions?: Iterable<string>;
  stage?: AutomationStudioHarnessOptionStage;
  /** The adaptation policy governing this call, when one does. Where it is
   * present it is authoritative over side effects. */
  policy?: AutomationStudioAdaptationPolicy;
  /** Whether a call no adaptation policy governs -- authoring a new Flow, for
   * one -- may still take a mutating option. Absent means no: the caller has
   * to say so, rather than a missing policy quietly meaning permission. It
   * never overrides a policy that is present. */
  allowSideEffectsWithoutPolicy?: boolean;
  /** Options whose `requiresOperatorApproval` a person has already answered. */
  approvedOptionIds?: Iterable<string>;
};

export type AutomationStudioHarnessOptionLoopBinding = {
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool(input: {
    callId: string;
    toolId: string;
    value: JsonObject;
    maxEvidenceBytes: number;
    signal?: AbortSignal;
  }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
};

export class AutomationStudioHarnessOptionRegistry {
  private readonly options = new Map<string, AutomationStudioHarnessOption>();
  private readonly implementations = new Map<string, AutomationStudioHarnessOptionImplementation>();
  private readonly domains = new Set<string>();

  /** Seeded with Core's own options for the given host, so a domain always
   * registers into a non-empty set and there is something to extend. */
  constructor(input: { host?: AutomationStudioHarnessOptionHost } = {}) {
    if (input.host) this.register(builtinAutomationStudioHarnessOptions(input.host));
  }

  register(bundle: AutomationStudioHarnessOptionBundle): this {
    if (bundle.schemaVersion !== "0.1") throw new Error("Automation Studio harness option bundle schema version is unsupported.");
    const domainId = bundle.domainId;
    if (domainId !== undefined) {
      if (!DOMAIN_ID.test(domainId)) throw new Error("Automation Studio harness option bundle domain id is invalid.");
      // One bundle per domain, matching the importer SDK: a second bundle would
      // make what the loop may do depend on registration order.
      if (this.domains.has(domainId)) throw new Error(`Automation Studio harness options for domain "${domainId}" are already registered. Build a new host runtime instead of registering twice.`);
    }
    if (!Array.isArray(bundle.options) || !bundle.options.length) throw new Error("Automation Studio harness option bundle declares no options.");
    if (this.options.size + bundle.options.length > AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT) {
      throw new Error(`Automation Studio harness options exceed the limit of ${AUTOMATION_STUDIO_HARNESS_OPTION_LIMIT}.`);
    }
    for (const option of bundle.options) {
      const issues = automationStudioHarnessOptionIssues(option);
      if (issues.length) throw new Error(`Invalid Automation Studio harness option "${option.toolId}": ${issues.join(", ")}`);
      assertBundleScope(option, domainId);
      // Extend, never replace. A domain that wants different behaviour
      // registers a different id; it can never take over a Core option, and
      // two domains can never silently fight over one.
      if (this.options.has(option.toolId)) throw new Error(`Automation Studio harness option "${option.toolId}" is already registered.`);
      if (typeof bundle.implementations[option.toolId] !== "function") throw new Error(`Automation Studio harness option "${option.toolId}" has no implementation.`);
    }
    for (const key of Object.keys(bundle.implementations)) {
      if (!bundle.options.some((option) => option.toolId === key)) throw new Error(`Automation Studio harness option implementation "${key}" declares no option.`);
    }
    for (const option of bundle.options) {
      this.options.set(option.toolId, option);
      this.implementations.set(option.toolId, bundle.implementations[option.toolId]!);
    }
    if (domainId !== undefined) this.domains.add(domainId);
    return this;
  }

  get(optionId: string, resolution?: AutomationStudioHarnessOptionResolution): AutomationStudioHarnessOption | undefined {
    const option = this.options.get(optionId);
    return option && (!resolution || isOffered(option, resolution)) ? option : undefined;
  }

  list(resolution: AutomationStudioHarnessOptionResolution): AutomationStudioHarnessOption[] {
    return [...this.options.values()].filter((option) => isOffered(option, resolution));
  }

  /**
   * The offered options as evidence-loop tools: the six fields the loop and the
   * provider accept, and nothing else.
   *
   * One repair happens here. The loop rejects its whole configuration when a
   * tool says `repeatPolicy: "after_mutation"` and no tool in the same list can
   * mutate, which is reachable whenever a Core observation is offered without a
   * domain's mutating option beside it. The policy is dropped in that case: it
   * only ever meant "not again until something changes", and with nothing able
   * to change anything the loop's duplicate-request check already says the same.
   */
  tools(resolution: AutomationStudioHarnessOptionResolution): AutomationStudioLlmEvidenceTool[] {
    const offered = this.list(resolution);
    const mutable = offered.some((option) => option.effect === "mutate");
    return offered.map((option) => {
      const tool = automationStudioHarnessOptionTool(option);
      if (!mutable && tool.repeatPolicy !== undefined) delete tool.repeatPolicy;
      return tool;
    });
  }

  /**
   * Runs one option, re-checking the same resolution that built the tool list.
   * The model chooses the id, so the check has to happen again at dispatch and
   * not only in the grammar it was given.
   */
  async execute(
    input: AutomationStudioHarnessOptionExecution,
    resolution: AutomationStudioHarnessOptionResolution
  ): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult> {
    if (!this.get(input.optionId, resolution)) throw new Error(`Automation Studio harness option "${input.optionId}" is not offered in this scope.`);
    const implementation = this.implementations.get(input.optionId);
    if (!implementation) throw new Error(`Automation Studio harness option "${input.optionId}" has no implementation.`);
    return implementation(input);
  }

  /**
   * The pair the evidence loop needs, built from one resolution so the grammar
   * the model is given and the gate its call passes through can never drift.
   */
  evidenceLoopBinding(
    context: { projectId: string; flowId: string; runId?: string },
    resolution: AutomationStudioHarnessOptionResolution
  ): AutomationStudioHarnessOptionLoopBinding {
    return {
      tools: this.tools(resolution),
      executeTool: ({ callId, toolId, value, maxEvidenceBytes, signal }) => this.execute({
        projectId: context.projectId,
        flowId: context.flowId,
        ...(context.runId !== undefined ? { runId: context.runId } : {}),
        callId,
        optionId: toolId,
        value,
        maxEvidenceBytes,
        ...(signal !== undefined ? { signal } : {})
      }, resolution)
    };
  }
}

function assertBundleScope(option: AutomationStudioHarnessOption, domainId: string | undefined): void {
  if (domainId === undefined) {
    if (option.availability.kind === "domain") throw new Error(`Automation Studio harness option "${option.toolId}" is domain-scoped but was registered as a Core option.`);
    return;
  }
  if (option.availability.kind !== "domain" || option.availability.domainId !== domainId) {
    throw new Error(`Automation Studio harness option "${option.toolId}" must be scoped to domain "${domainId}".`);
  }
}

function isOffered(option: AutomationStudioHarnessOption, resolution: AutomationStudioHarnessOptionResolution): boolean {
  if (!scopeAllows(option.availability, resolution.scope)) return false;
  const runtimeCapabilities = new Set(resolution.runtimeCapabilities ?? []);
  if (option.requiredRuntimeCapabilities?.some((capability) => !runtimeCapabilities.has(capability))) return false;
  const permissions = new Set(resolution.permissions ?? []);
  if (option.safety?.requiredPermissions?.some((permission) => !permissions.has(permission))) return false;
  if (!stageAllows(option, resolution.stage)) return false;
  if (!sideEffectAllows(option, resolution.policy)) return false;
  if (option.safety?.requiresOperatorApproval === true && !new Set(resolution.approvedOptionIds ?? []).has(option.toolId)) return false;
  return true;
}

function scopeAllows(availability: AutomationStudioNodeAvailability, scope: AutomationStudioFlowScope): boolean {
  if (availability.kind === "both") return true;
  if (availability.kind === "global") return scope.kind === "global";
  return scope.kind === "domain" && scope.domainId === availability.domainId;
}

/** An option pinned to stages is offered only inside one of them. A call that
 * names no stage is not a wildcard: offering the pinned option there would
 * widen it, so it is withheld until the caller says where it is. */
function stageAllows(option: AutomationStudioHarnessOption, stage: AutomationStudioHarnessOptionStage | undefined): boolean {
  if (option.stages === undefined) return true;
  return stage !== undefined && option.stages.includes(stage);
}

/** Destructive is never offered: gathering information never requires
 * destroying anything. Mutating needs the policy to permit side effects, and
 * an absent policy fails closed. */
function sideEffectAllows(option: AutomationStudioHarnessOption, policy: AutomationStudioAdaptationPolicy | undefined): boolean {
  const sideEffect = option.safety?.sideEffect ?? (option.effect === "mutate" ? "mutate" : "observe");
  if (sideEffect === "destructive") return false;
  if (sideEffect !== "mutate") return true;
  return policy?.allowExternalSideEffects === true;
}
