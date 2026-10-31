import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioResolvedActionEffectRepeatSafe, readAutomationStudioResolvedActionEffect, type AutomationStudioResolvedActionEffect } from "../../../nodes/action-effect/index.ts";
import { automationStudioFlowDraftHoldsBinding } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceCanonicalJson, automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import { automationStudioLlmRunNodesReadReceipt } from "./result.ts";
import type { AutomationStudioLlmRunNodesConcreteInput, AutomationStudioLlmRunNodesOriginal, AutomationStudioLlmRunNodesPriorCall } from "./types.ts";

/** A real admitted original, reduced to frozen execution arguments and trusted safety/authority. */
export function automationStudioLlmRunNodesOriginal(prior: AutomationStudioLlmRunNodesPriorCall, callId: string, loopId: string): AutomationStudioLlmRunNodesOriginal | undefined {
  if (!code(loopId)) return undefined;
  if (prior.callId !== callId || prior.loopId !== loopId || prior.toolId !== "core.run_node") return undefined;
  if (!code(prior.definitionId) || !code(prior.definitionVersion) || !code(prior.authorityKey)) return undefined;
  const read = automationStudioLlmRunNodesReadReceipt(prior.execution);
  if (read.kind !== "succeeded" || !concreteInput(prior.input) || !Object.hasOwn(prior, "effectiveInputs") || !automationStudioLlmRunNodesJsonObject(prior.effectiveInputs)) return undefined;
  const actionEffect = readAutomationStudioResolvedActionEffect(prior.actionEffect);
  const observedEffect = prior.observedEffect === undefined ? undefined : readAutomationStudioResolvedActionEffect(prior.observedEffect);
  if (!automationStudioLlmRunNodesEffectSafe(actionEffect) || (observedEffect && !automationStudioLlmRunNodesEffectSafe(observedEffect))) return undefined;
  const input = structuredClone(prior.input);
  // Preserve the actual parameters, and dispatch their proven stable library definition rather than an alias.
  input.node = prior.definitionId;
  const original: AutomationStudioLlmRunNodesOriginal = {
    callId,
    loopId,
    definitionId: prior.definitionId,
    definitionVersion: prior.definitionVersion,
    input,
    effectiveInputs: structuredClone(prior.effectiveInputs),
    authorityKey: prior.authorityKey,
    resultCode: read.resultCode,
    actionEffect,
    observedEffect
  };
  return automationStudioLlmRunNodesFreeze(original);
}

/** Trust comes from the producer, while the owning reader establishes shape and commit floors. */
export function automationStudioLlmRunNodesEffectSafe(effect: AutomationStudioResolvedActionEffect): boolean {
  return automationStudioResolvedActionEffectRepeatSafe(effect);
}

/** Full JSON validation is the existing execution reader's, not another serializer. */
export function automationStudioLlmRunNodesJsonObject(value: JsonObject): boolean {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && automationStudioLlmEvidenceParseToolExecutionResult({ value }, "observe"));
}

/** Freeze private snapshots without touching the registry's or the caller's data. */
export function automationStudioLlmRunNodesFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const member of Object.values(value)) automationStudioLlmRunNodesFreeze(member);
    Object.freeze(value);
  }
  return value;
}

/** INTERNAL identity retains all actual parameters, effective node-port inputs and stable library identity. */
export function automationStudioLlmRunNodesEffectiveInput(original: AutomationStudioLlmRunNodesOriginal): JsonObject {
  return { node: original.definitionId, parameters: structuredClone(original.input.parameters), effectiveInputs: structuredClone(original.effectiveInputs) };
}

/** Revalidation also compares effective arguments when D reconstructs an original from its registry. */
export function automationStudioLlmRunNodesSameInput(left: JsonObject, right: JsonObject): boolean {
  return automationStudioLlmEvidenceCanonicalJson(left) === automationStudioLlmEvidenceCanonicalJson(right);
}

function concreteInput(input: JsonObject): input is AutomationStudioLlmRunNodesConcreteInput {
  if (!automationStudioLlmRunNodesJsonObject(input)) return false;
  if (Object.keys(input).some((key) => key !== "node" && key !== "parameters" && key !== "consequences")) return false;
  if (!code(input.node) || !input.parameters || typeof input.parameters !== "object" || Array.isArray(input.parameters)) return false;
  if (!Array.isArray(input.consequences) || input.consequences.length !== 0) return false;
  return !automationStudioFlowDraftHoldsBinding(input.parameters);
}

function code(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/\s/u.test(value);
}
