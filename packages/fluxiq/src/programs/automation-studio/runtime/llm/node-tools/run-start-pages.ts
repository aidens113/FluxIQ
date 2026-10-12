// Where each node of a finished run started, read off the run's own record.
//
// **The failure this closes (live run `run-muqk713g-d08ad3dc`, C6).** After the
// saved Flow's answer was refuted, the re-author seeded its draft from the Flow
// (`./draft-from-flow.ts`). A seeded step records no `replay.from` -- the build
// never ran it -- so every rerun of the Flow's list read ran where the refuted
// run had left the page: results page 5, one page of 11 items, none kept. The
// model chased a dedupe that was not the problem and dropped a correct
// condition. Yet the run *had* watched that node start: the executor captures
// the host's state before every attempt (`executor/host-state.ts`) and the run
// record keeps it on the attempt as `metadata.stateRefs.beforeAction`.
//
// **What is read, and why it is the host's token.** A state snapshot's
// `summary` is the host's view of the page, and Core reads no domain's view.
// What a reset needs is the token the host itself hands back as a step's
// `replay.from` (`./replay.ts`): the caller's own words for "put the target
// back here", carried unread. So the snapshot ref carries that same token as
// `from`, written by the host that took the snapshot, and this reads it whole
// and reads nothing inside it. A host that writes no `from` leaves every node
// with no start page, and a rerun then runs where the page is and says so
// (`./step-place.ts`).
//
// **Which attempt.** A node's first. A retry starts wherever its failed attempt
// left the page, which is the very thing a rerun must not inherit, so a node
// whose first attempt captured nothing has no start page rather than a later
// attempt's.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunActionAttemptRecord } from "../../../model/index.ts";

/**
 * The host's token for the page each node's first attempt started on, by node
 * id, for the nodes whose state was captured with one. Copies, so whoever seeds
 * a draft from them cannot write into the run record.
 */
export function automationStudioRunNodeStartPages(run: { actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined }): Record<string, JsonObject> {
  const first = new Map<string, AutomationStudioFlowRunActionAttemptRecord>();
  for (const attempt of [...(run.actionAttempts ?? [])].sort((left, right) => left.order - right.order)) {
    // The root frame's nodes only: a called part's node (`parentAttemptId`) can share an id with one.
    if (attempt.parentAttemptId === undefined && !first.has(attempt.nodeId)) first.set(attempt.nodeId, attempt);
  }
  const pages: Record<string, JsonObject> = {};
  for (const [nodeId, attempt] of first) {
    const from = startToken(attempt);
    if (from) pages[nodeId] = structuredClone(from);
  }
  return pages;
}

/** `metadata.stateRefs.beforeAction.from`, when it is an object. */
function startToken(attempt: AutomationStudioFlowRunActionAttemptRecord): JsonObject | undefined {
  const stateRefs = record(attempt.metadata?.stateRefs);
  const before = record(stateRefs?.beforeAction);
  return record(before?.from);
}

function record(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}
