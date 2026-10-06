// What each step changed in the run being judged, as the finished-run check is
// shown it (run `run-muw5zv4m-52d83027`).
//
// **Why.** A saved Flow's playback built the exact cart the request asked for,
// and both post-run judges answered no: one read the search step as opening the
// wrong pack, ignoring the next step that chose the right one, and the other
// read one "+" press as a quantity of 1. Their evidence was status rows and the
// end view, whose header count is stale by the site's design. The build-test
// judges of the same Flow answered yes, because a build-test step carries what
// it changed (`build-test/change-lines.ts`). The false no routed a re-author
// that cost money and failed. Core already held each change: the executor puts
// the domain's diff on every attempt it traces (`executor/host-state.ts`,
// `stateRefs.stateDiff`), and the verification has the session's trace in hand.
//
// **What is carried.** For each attempt of this session, in the order it ran,
// the diff's `added` and `removed` -- the domain's own view lines, joined as
// the domain joined them -- and nothing else of it: no refs, no locations, no
// counts. Core reads three of the diff's words and interprets none of its
// lines. A diff that says its location changed is not carried at all: the
// whole page changed, and the steps after it and the end view say what it
// became. No line is capped.
//
// **Screened like the end view** (`result-summary.ts`,
// `automationStudioResultEndView`): nothing without a declaration of the
// domain's denied keys; a diff holding a denied key or a credential-shaped
// value anywhere is withheld whole; a locator-shaped run inside a line is
// redacted. Each sets `withheld`, so the judge is never shown a screened
// picture that reads as a whole one. Nothing is read from a persisted record
// and nothing new is persisted: the trace is the session's own, in memory.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioWithoutLocators, screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import type { AutomationStudioResultFlowStepSummary } from "./contracts.ts";

/** One traced attempt, as far as this reads it. */
type TracedAttempt = { nodeId: string; stateRefs?: { stateDiff?: JsonObject } | undefined };

/** Each node's sendable changes, in run order, and whether anything was held back. */
export function automationStudioResultStepChanges(
  attempts: readonly TracedAttempt[] | undefined,
  deniedEvidenceKeys: readonly string[] | undefined
): { byNode: Map<string, NonNullable<AutomationStudioResultFlowStepSummary["changed"]>>; withheld: boolean } {
  const byNode = new Map<string, NonNullable<AutomationStudioResultFlowStepSummary["changed"]>>();
  let withheld = false;
  for (const attempt of attempts ?? []) {
    const diff = attempt.stateRefs?.stateDiff;
    if (!diff || diff.locationChanged === true) continue;
    const added = lines(diff.added);
    const removed = lines(diff.removed);
    if (added === undefined && removed === undefined) continue;
    if (deniedEvidenceKeys === undefined) {
      withheld = true;
      continue;
    }
    const found = screenAutomationStudioLlmEvidence(diff, deniedEvidenceKeys);
    if (found.deniedKey || found.secretShaped) {
      withheld = true;
      continue;
    }
    const change = automationStudioWithoutLocators({ ...(added !== undefined ? { added } : {}), ...(removed !== undefined ? { removed } : {}) });
    if (change.added !== added || change.removed !== removed) withheld = true;
    byNode.set(attempt.nodeId, [...(byNode.get(attempt.nodeId) ?? []), change]);
  }
  return { byNode, withheld };
}

/** The domain's lines as it wrote them, when it wrote any. */
function lines(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
