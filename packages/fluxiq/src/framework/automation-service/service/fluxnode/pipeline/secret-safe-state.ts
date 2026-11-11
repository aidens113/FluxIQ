import { dataFieldPathSteps, fluxNodeSecretInputs, type DataExpression, type DataFieldPath, type DataPipeline } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../../core/index.ts";
import type { PipelineState } from "../../pipelines/index.ts";
import type { FluxNodeOwnerFlows } from "../owner-flows.ts";
import { isRegisteredPipeline } from "./is-registered-pipeline.ts";

type SecretMap = { cachedFor: Set<string>; unkeyed: Set<string> };

/** The record field paths an expression reads. */
function fieldsRead(expression: DataExpression, into: DataFieldPath[] = []): DataFieldPath[] {
  if ("field" in expression) into.push(expression.field);
  else if ("op" in expression) for (const arg of expression.args) fieldsRead(arg, into);
  else if ("object" in expression) for (const member of Object.values(expression.object)) fieldsRead(member, into);
  else if ("list" in expression) for (const item of expression.list) fieldsRead(item, into);
  return into;
}

/** Whether one path is the other or lies inside it. */
const overlaps = (a: DataFieldPath, b: DataFieldPath): boolean => {
  const [left, right] = [dataFieldPathSteps(a), dataFieldPathSteps(b)];
  const shared = Math.min(left.length, right.length);
  return left.slice(0, shared).every((step, index) => step === right[index]);
};

/**
 * What a pipeline remembers between runs (`PipelineState`), with a mapped FluxNode's secret input kept out of it.
 * The mapped steps are read from the pipeline's definition against the FluxNodes it names:
 *
 * - **A cached call** (`reuseResultsForMs`) is keyed by its target and inputs, which would hold the secret in
 *   plain text. A call to a FluxNode with a secret input is therefore never cached: nothing is stored under a
 *   key and nothing is read back, so the step makes its call each time. (A hash of a password is not safe to keep either.)
 * - **An incremental key** (`skipProcessedBy`) is made of record fields. When the step's secret input is built
 *   from a record field the key also reads, that step is never skipped and no key is stored; otherwise the key
 *   holds none of the secret and is kept as it is.
 *
 * With no secret input mapped, `state` itself.
 */
export async function fluxNodePipelineStateWithoutSecrets(state: PipelineState, pipeline: DataPipeline, flows: Pick<FluxNodeOwnerFlows, "find">): Promise<PipelineState> {
  const held: SecretMap = { cachedFor: new Set(), unkeyed: new Set() };
  for (const step of pipeline.steps) {
    if (step.kind !== "map" || !("fluxNode" in step.target)) continue;
    const found = await flows.find(step.target.fluxNode);
    if ("missing" in found || isRegisteredPipeline(found.found)) continue;
    const names = fluxNodeSecretInputs(found.found.spec.inputs).names.filter((name) => step.inputs[name] !== undefined);
    if (!names.length) continue;
    held.cachedFor.add(step.target.fluxNode);
    const secretFields = names.flatMap((name) => fieldsRead(step.inputs[name] as DataExpression));
    if (step.skipProcessedBy?.some((key) => secretFields.some((field) => overlaps(key, field)))) held.unkeyed.add(step.id);
  }
  if (!held.cachedFor.size && !held.unkeyed.size) return state;
  return {
    isProcessed: async (projectId, name, stepId, key) => !held.unkeyed.has(stepId) && await state.isProcessed(projectId, name, stepId, key),
    markProcessed: async (projectId, name, stepId, key) => { if (!held.unkeyed.has(stepId)) await state.markProcessed(projectId, name, stepId, key); },
    getCachedCall: async (projectId, callKey, now) => (callsSecretNode(callKey, held.cachedFor) ? undefined : await state.getCachedCall(projectId, callKey, now)),
    putCachedCall: async (projectId, callKey, call, expiresAt) => { if (!callsSecretNode(callKey, held.cachedFor)) await state.putCachedCall(projectId, callKey, call, expiresAt); }
  };
}

/** Whether a call key (`canonicalJson({ target, inputs })`) is for a FluxNode with a secret input mapped. */
function callsSecretNode(callKey: string, nodes: ReadonlySet<string>): boolean {
  try {
    const target = (JSON.parse(callKey) as { target?: JsonObject }).target;
    return typeof target?.["fluxNode"] === "string" && nodes.has(target["fluxNode"]);
  } catch {
    return true;
  }
}
