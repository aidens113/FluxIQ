// One recovery incident and its occurrence keys (state-aware recovery plan, C7).
//
// This module owns the incident record and the occurrence key. An incident
// opens at the first failed attempt that reaches C6 step 5 and closes when the
// run passes the node or ends; it is marked `trueFailure` at the moment C6's
// definition is met, the only trigger for in-run repair. It crosses frame
// boundaries unchanged: a child's unresolved failure becomes its Call Subflow
// node's failure in the parent under the same incident, so handlers already
// tried for it are not run again there.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFramePath } from "../frames/index.ts";

/** One recovery incident. `handlersRun` holds occurrence keys, in the order they ran. */
export type AutomationStudioRecoveryIncident = {
  incidentId: string;
  origin: { framePath: AutomationStudioFramePath; nodeId: string; failureCode: string };
  handlersRun: string[];
  routes: Array<{ checkpointId: string; handlerId: string }>;
  alternatives: Array<{ handlerId: string; subflowId?: string }>;
  startedAt: number;
  trueFailure?: boolean;
};

/**
 * What makes one handler run one occurrence: the handler, the node arrival it
 * fired at (the frame, the node, and which arrival at that node this is), and
 * the condition evidence its `when` was decided on.
 */
export type AutomationStudioHandlerOccurrence = {
  handlerId: string;
  nodeArrival: { invocationId: string; nodeId: string; arrival: number };
  conditionEvidence: JsonValue;
};

/**
 * The occurrence key: handler id + node arrival + a digest of the condition
 * evidence. The same handler never runs twice for the same key, so a handler
 * that changed nothing the page shows cannot loop, while the same interruption
 * met again at a later arrival is a new occurrence.
 */
export function automationStudioHandlerOccurrenceKey(occurrence: AutomationStudioHandlerOccurrence): string {
  const { handlerId, nodeArrival } = occurrence;
  return `${handlerId}@${nodeArrival.invocationId}/${nodeArrival.nodeId}#${nodeArrival.arrival}:${evidenceDigest(occurrence.conditionEvidence)}`;
}

/**
 * A stable digest of JSON evidence: object keys sorted, so the same evidence
 * written in another key order digests the same. Two FNV-1a passes with
 * different offsets give 64 bits, plenty for keys compared within one run.
 */
function evidenceDigest(value: JsonValue): string {
  const text = canonical(value);
  return `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x01000193)}`;
}

function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(text: string, offset: number): string {
  let hash = offset >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
