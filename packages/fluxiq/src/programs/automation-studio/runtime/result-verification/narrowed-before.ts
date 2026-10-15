// The steps that acted on the page before each list read, as the judge is
// shown them (t482).
//
// **Why.** Lane C rounds 10 and 12 (`run-mv5uu9g1-9d80deea`,
// `run-mv62icw3-9118516f`): a Flow pressed a site filter whose band was
// narrower than the request's own bound, before its list read. The rows the
// band removed never reached the read, so no condition's `leftOutOnlyByThis`
// named them; the press moved to another page, so `flowShape[].changed`
// (`./step-changes.ts`) skipped it too. Four trial judges and the final check
// named the filter, found nothing missing, and said yes over 11 of 13 rows.
//
// **What is carried.** For each read, every step that ran before the read's
// first attempt and acted on the page: its attempt settled (succeeded and not
// skipped, or its try found the page already showing what it does), and its
// page comparison says it went to another page, changed the page it stayed on,
// or was not recorded at all -- a step whose comparison says nothing changed
// narrowed nothing, and is left out. A step that ran several times is named
// once, at its first run. Another read is never one: it narrows nothing on the
// page. The read's own paging comes after its first attempt, so a read never
// names its own next page; an earlier read's paging does belong to a later read.
//
// **Named by its own words, screened.** The step's label, as `flowShape` names
// it, and the control it pressed or chose, through the one owner of a
// control's sayable words (`../llm/model-facing/control-words.ts`): nothing
// says how the control was found. With no denied-keys declaration no control
// words are carried, as no parameters are (`./result-summary.ts`); a control
// whose words carry a denied key or a credential shape is left unnamed. Either
// sets `withheld`.
//
// Core reads three closed words of the domain's diff (`documentChanged`,
// `locationChanged`, and whether `added` or `removed` hold lines) and
// interprets none of its lines.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { automationStudioModelFacingControlWords } from "../llm/model-facing/index.ts";
import type { AutomationStudioResultNarrowingStep } from "./contracts/index.ts";

/** One traced attempt, as far as this reads it. */
type TracedAttempt = {
  nodeId: string;
  status?: string | undefined;
  skipped?: unknown;
  stateHeld?: unknown;
  stateRefs?: { stateDiff?: JsonObject } | undefined;
};

/** The steps before each read, by the read's node id; only reads that ran and had a step before them. */
export function automationStudioResultNarrowedBefore(input: {
  /** The node ids of the reads to account for: every read of the summary. */
  readNodeIds: readonly string[];
  flowNodes: readonly AutomationStudioFlowNode[];
  attempts: readonly TracedAttempt[] | undefined;
  deniedEvidenceKeys: readonly string[] | undefined;
}): { byRead: Map<string, AutomationStudioResultNarrowingStep[]>; withheld: boolean } {
  const byRead = new Map<string, AutomationStudioResultNarrowingStep[]>();
  let withheld = false;
  const attempts = input.attempts ?? [];
  const reads = new Set(input.readNodeIds);
  const nodes = new Map(input.flowNodes.map((node) => [node.id, node]));
  for (const read of reads) {
    const first = attempts.findIndex((attempt) => attempt.nodeId === read);
    if (first < 0) continue;
    const named = new Set<string>();
    const steps: AutomationStudioResultNarrowingStep[] = [];
    for (const attempt of attempts.slice(0, first)) {
      if (named.has(attempt.nodeId) || reads.has(attempt.nodeId)) continue;
      const effect = effectOf(attempt);
      if (effect === null) continue;
      named.add(attempt.nodeId);
      const node = nodes.get(attempt.nodeId);
      const control = controlOf(node, input.deniedEvidenceKeys);
      if (control.withheld) withheld = true;
      steps.push({
        nodeId: attempt.nodeId,
        ...(node?.label ? { label: node.label } : {}),
        ...(control.words ? { control: control.words } : {}),
        ...(effect ? { effect } : {})
      });
    }
    if (steps.length) byRead.set(read, steps);
  }
  return { byRead, withheld };
}

/**
 * What the attempt did to the page: its effect, `undefined` where it acted on
 * a page whose comparison was not recorded, and `null` where it did not settle,
 * saw no page, or its comparison says nothing changed (header).
 */
function effectOf(attempt: TracedAttempt): AutomationStudioResultNarrowingStep["effect"] | null {
  if (attempt.skipped) return null;
  if (attempt.stateHeld) return "already_shown";
  if (attempt.status !== "succeeded" || !attempt.stateRefs) return null;
  const diff = attempt.stateRefs.stateDiff;
  if (!diff) return undefined;
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  if (moved) return "new_page";
  return hasLines(diff.added) || hasLines(diff.removed) ? "same_page" : null;
}

/** The control's sayable words, screened against the domain's declared keys (header). */
function controlOf(node: AutomationStudioFlowNode | undefined, deniedEvidenceKeys: readonly string[] | undefined): { words?: string; withheld: boolean } {
  const words = automationStudioModelFacingControlWords(node?.parameterValues);
  if (words === undefined) return { withheld: false };
  if (deniedEvidenceKeys === undefined) return { withheld: true };
  const found = screenAutomationStudioLlmEvidence(words, deniedEvidenceKeys);
  return found.deniedKey || found.secretShaped ? { withheld: true } : { words, withheld: false };
}

function hasLines(value: JsonValue | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}
