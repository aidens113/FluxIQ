import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioFlowRunSummary } from "../../../model/index.ts";

// A run's detail is saved more than once: from the bare session while the run
// is under way, then with what the recovery annotation added, and again by any
// path that rebuilds a detail from its session. A later save must never lose
// what an earlier one recorded, so every save is merged onto the stored detail.
//
// The rule is narrow on purpose. The incoming detail wins for every key it
// carries, including a key it sets to `undefined`. A stored key the incoming
// detail does not carry is kept, except the keys the session projection
// (`runtimeSessionToFlowRunDetail`) owns -- it sets those whenever they apply,
// so their absence is a statement (a failure reason that no longer holds) --
// and the keys the stores recompute on every save or decorate on every read.

const SESSION_PROJECTION_METADATA_KEYS: ReadonlySet<string> = new Set([
  "compatibilitySource",
  "targetKind",
  "targetId",
  "recoveryAttemptCount",
  "comparisonCount",
  "terminalFailureReason",
  "message",
  "currentNodeId"
]);

// `adaptiveMetrics` is recomputed by every save; `eventStream` and
// `collectionsPaged` are added by the typed store's reads and describe the read.
const STORE_DERIVED_METADATA_KEYS: ReadonlySet<string> = new Set(["adaptiveMetrics", "eventStream", "collectionsPaged"]);

// The summary projection sets these, and the typed store adds the last two on
// every read of the run row.
const SUMMARY_PROJECTION_METADATA_KEYS: ReadonlySet<string> = new Set([
  "compatibilitySource",
  "targetKind",
  "targetId",
  "effectCount",
  "recoveryAttemptCount",
  "errorCount",
  "lastEventSequence"
]);

/**
 * The detail to persist when `incoming` is saved over `stored`. With nothing
 * stored, `incoming` is returned unchanged. Collections are merged by record
 * id, the incoming version of a record replacing the stored one. The summary's
 * counts, intervention summaries and token usage are recomputed from the merged
 * collections by the save that follows, so only fields no save recomputes are
 * carried here.
 */
export function runDetailPreservingStored(
  stored: AutomationStudioFlowRunDetail | null,
  incoming: AutomationStudioFlowRunDetail
): AutomationStudioFlowRunDetail {
  if (!stored || stored.summary.runId !== incoming.summary.runId) return incoming;
  const actionAttempts = mergeOptionalRecords(stored.actionAttempts, incoming.actionAttempts, (record) => record.attemptId);
  const recoveryAttempts = mergeOptionalRecords(stored.recoveryAttempts, incoming.recoveryAttempts, (record) => record.recoveryId);
  const inputs = incoming.inputs ?? stored.inputs;
  const startingStateRefs = incoming.startingStateRefs ?? stored.startingStateRefs;
  const evidence = incoming.evidence ?? stored.evidence;
  return {
    ...incoming,
    summary: summaryPreservingStored(stored.summary, incoming.summary),
    ...(inputs !== undefined ? { inputs } : {}),
    ...(startingStateRefs !== undefined ? { startingStateRefs } : {}),
    routeDecisions: mergeRecords(stored.routeDecisions, incoming.routeDecisions, (record) => record.decisionId),
    subflows: mergeRecords(stored.subflows, incoming.subflows, (record) => record.entryId),
    ...(actionAttempts !== undefined ? { actionAttempts } : {}),
    ...(recoveryAttempts !== undefined ? { recoveryAttempts } : {}),
    interventions: mergeRecords(stored.interventions, incoming.interventions, (record) => record.interventionId),
    adaptationIds: orderedUnion(stored.adaptationIds, incoming.adaptationIds),
    changeProposalIds: orderedUnion(stored.changeProposalIds, incoming.changeProposalIds),
    ...(evidence !== undefined ? { evidence } : {}),
    metadata: metadataPreservingStored(stored.metadata, incoming.metadata, SESSION_PROJECTION_METADATA_KEYS, STORE_DERIVED_METADATA_KEYS)
  };
}

function summaryPreservingStored(stored: AutomationStudioFlowRunSummary, incoming: AutomationStudioFlowRunSummary): AutomationStudioFlowRunSummary {
  const flowVersion = "flowVersion" in incoming ? incoming.flowVersion : stored.flowVersion;
  const tokenUsage = "tokenUsage" in incoming ? incoming.tokenUsage : stored.tokenUsage;
  const metadata = incoming.metadata === undefined && stored.metadata === undefined
    ? undefined
    : metadataPreservingStored(stored.metadata, incoming.metadata, SUMMARY_PROJECTION_METADATA_KEYS, new Set());
  return {
    ...incoming,
    ...(flowVersion !== undefined ? { flowVersion } : {}),
    ...(tokenUsage !== undefined ? { tokenUsage } : {}),
    ...(metadata !== undefined ? { metadata } : {})
  };
}

function metadataPreservingStored(
  stored: JsonObject | undefined,
  incoming: JsonObject | undefined,
  projectionKeys: ReadonlySet<string>,
  derivedKeys: ReadonlySet<string>
): JsonObject {
  const next: JsonObject = incoming ?? {};
  const carried = Object.entries(stored ?? {}).filter(([key]) => !(key in next) && !projectionKeys.has(key) && !derivedKeys.has(key));
  return { ...Object.fromEntries(carried), ...next };
}

function mergeOptionalRecords<TRecord>(stored: TRecord[] | undefined, incoming: TRecord[] | undefined, idOf: (record: TRecord) => string): TRecord[] | undefined {
  if (stored === undefined && incoming === undefined) return undefined;
  return mergeRecords(stored ?? [], incoming ?? [], idOf);
}

// Stored order first, so a richer earlier ordering survives, then the records
// only the incoming detail has, in its order.
function mergeRecords<TRecord>(stored: TRecord[], incoming: TRecord[], idOf: (record: TRecord) => string): TRecord[] {
  const incomingById = new Map(incoming.map((record) => [idOf(record), record] as const));
  const merged = stored.map((record) => incomingById.get(idOf(record)) ?? record);
  const storedIds = new Set(stored.map(idOf));
  return [...merged, ...incoming.filter((record) => !storedIds.has(idOf(record)))];
}

function orderedUnion(stored: string[], incoming: string[]): string[] {
  return [...new Set([...(stored ?? []), ...(incoming ?? [])])];
}
