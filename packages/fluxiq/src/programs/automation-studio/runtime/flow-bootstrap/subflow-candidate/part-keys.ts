import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS, type AutomationStudioFlowBootstrapSubflow } from "../plan/index.ts";

/** The plan's symbolic key rule (`../plan/issues.ts`): what every re-keyed part must still meet. */
const MAX_KEY_LENGTH = 64;

/**
 * A helper part's key in a proposal: `<subflowKey>-<its own key>`, so the parts
 * of two briefs never collide when the supervisor assembles every proposal
 * into one plan (t537). A key past the plan's 64 characters keeps its head and
 * ends with a hash of the whole, so it stays a valid symbol and distinct.
 */
export function automationStudioSubflowPartKey(subflowKey: string, partKey: string): string {
  const key = `${subflowKey}-${partKey}`;
  if (key.length <= MAX_KEY_LENGTH) return key;
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return `${key.slice(0, MAX_KEY_LENGTH - hash.length - 1)}-${hash}`;
}

/** The record-set id limit (`../plan/record-output-contract.ts`: 1-200 of A-Za-z0-9._:-). */
const MAX_DATASET_ID_LENGTH = 200;

/**
 * A step's id as authoring derives one where no draft step names it
 * (`../authoring/assemble.ts`): its subflow's key, a dash and its node key. A
 * record output's dataset id with no name written ends with it
 * (`../authoring/record-output.ts`), so it is unique per subflow exactly when
 * this is.
 */
export function automationStudioSubflowStepId(subflowKey: string, nodeKey: string): string {
  return `${subflowKey}-${nodeKey}`;
}

/**
 * The target followed by its helper parts, each part re-keyed under the target
 * (`automationStudioSubflowPartKey`) and every Call Subflow step that names one
 * rewritten to its new key. A part's step ids follow its key, so a record
 * output whose dataset id was derived from the old step id
 * (`<name>-<part>-<node>`) is renamed to the new one
 * (`<name>-<subflow>-<part>-<node>`): two briefs whose builders both name a
 * helper `narrow` no longer save to one dataset (t555). The target's step
 * ids follow the scope's key the same way where it was written under another
 * (`targetWrittenKey`, a router-run entry written as `main`), so two briefs'
 * alternative entries do not share one either. A dataset id the model wrote
 * itself is its own and is left; assembly refuses one two briefs share. The
 * subflows given are not changed.
 */
export function automationStudioSubflowRekeyedParts(
  target: AutomationStudioFlowBootstrapSubflow,
  parts: readonly AutomationStudioFlowBootstrapSubflow[],
  options: { targetWrittenKey?: string | undefined } = {}
): AutomationStudioFlowBootstrapSubflow[] {
  const renamed = new Map(parts.map((part) => [part.key, automationStudioSubflowPartKey(target.key, part.key)]));
  const targetFrom = options.targetWrittenKey !== undefined && options.targetWrittenKey !== target.key ? options.targetWrittenKey : undefined;
  return [{ subflow: target, from: targetFrom }, ...parts.map((part) => ({ subflow: { ...part, key: renamed.get(part.key)! }, from: part.key }))].map(({ subflow, from }) => ({
    ...structuredClone(subflow),
    nodes: subflow.nodes.map((node) => {
      const copy = structuredClone(node);
      const parameters = copy.parameters as JsonObject | undefined;
      const called = node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow ? parameters?.subflowId : undefined;
      if (parameters && typeof called === "string" && renamed.has(called)) parameters.subflowId = renamed.get(called)!;
      if (parameters && from !== undefined) renameDerivedDatasets(parameters, automationStudioSubflowStepId(from, node.key), automationStudioSubflowStepId(subflow.key, node.key));
      return copy;
    })
  }));
}

/** Each record output among a step's parameters (an object naming a `datasetId`) whose id ends with the old step id, re-ended with the new one. */
function renameDerivedDatasets(parameters: JsonObject, oldStepId: string, newStepId: string): void {
  const suffix = `-${oldStepId}`;
  for (const value of Object.values(parameters)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const output = value as JsonObject;
    const id = output.datasetId;
    if (typeof id !== "string" || !id.endsWith(suffix) || id.length === suffix.length) continue;
    const head = id.slice(0, id.length - suffix.length).slice(0, Math.max(1, MAX_DATASET_ID_LENGTH - newStepId.length - 1));
    output.datasetId = `${head}-${newStepId}`;
  }
}
