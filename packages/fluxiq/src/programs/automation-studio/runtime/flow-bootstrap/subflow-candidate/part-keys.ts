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

/**
 * The target followed by its helper parts, each part re-keyed under the target
 * (`automationStudioSubflowPartKey`) and every Call Subflow step that names one
 * rewritten to its new key. The subflows given are not changed.
 */
export function automationStudioSubflowRekeyedParts(target: AutomationStudioFlowBootstrapSubflow, parts: readonly AutomationStudioFlowBootstrapSubflow[]): AutomationStudioFlowBootstrapSubflow[] {
  const renamed = new Map(parts.map((part) => [part.key, automationStudioSubflowPartKey(target.key, part.key)]));
  return [target, ...parts.map((part) => ({ ...part, key: renamed.get(part.key)! }))].map((subflow) => ({
    ...structuredClone(subflow),
    nodes: subflow.nodes.map((node) => {
      const copy = structuredClone(node);
      const parameters = copy.parameters as JsonObject | undefined;
      const called = node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow ? parameters?.subflowId : undefined;
      if (parameters && typeof called === "string" && renamed.has(called)) parameters.subflowId = renamed.get(called)!;
      return copy;
    })
  }));
}
