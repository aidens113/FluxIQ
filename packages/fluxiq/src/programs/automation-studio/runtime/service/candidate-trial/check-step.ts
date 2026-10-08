// What a trial's failed check step tells the model (t368).
//
// Lane A round 7 (t342, qualifying run 2, `run-muz3jyz8-1d363a69`): all six
// trials did every act right and then failed on the model's own last step,
// `wait_for_text "Cart (3)"`. The page holds that text only inside a closed
// mini-cart, and the feedback said only that it "did not appear before the
// timeout", so the model kept the wait, re-tested, and the build ended without
// progress. A failed wait or assert now says what it waited for and, when the
// domain reports it, whether that text is on the page but hidden or not on the
// page at all, with the visible text most like it; and it says that a check
// which only confirms the act before it is not needed, because the build-test
// judge reads the page the run ends on.
//
// **Where the domain's detail is read.** The web domain (t369) reports, for a
// failed wait for text or assert on text, `textPresence: "hidden" | "absent"`
// and `visibleNear: string[]` (at most three snippets of at most 80 characters;
// a snippet the extension's secret screen would change is dropped there). They
// are not on the failure record, whose parser refuses any unknown key; they
// ride on the action result the dispatch returned, `payload.result`, which a
// failed attempt keeps as `outputs.result.result`. (The domain also puts them
// on the command's `metadata.failureDiagnostics`, which does not reach the
// attempt.) Anything that is not exactly that shape is ignored, never
// repaired, and the step then says only what it waited for.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";

/** The bounds the domain's contract states; a longer list or snippet is cut to them. */
const VISIBLE_NEAR_MAX_ITEMS = 3;
const VISIBLE_NEAR_MAX_CHARS = 80;
/** The most of an awaited text quoted back to the model. */
const AWAITED_MAX_CHARS = 120;

/** A step that waits for or checks something on the page, by its node: the web domain's `wait_for_text`, `wait_for_selector` and `assert`. */
const CHECK_NODE = /(?:^|[.\-_])(?:wait|assert)/u;

const ADVICE = "A check that only confirms the act before it is not needed: the judge reads the page the run ends on. Keep a wait only where a later step needs the page ready, and wait for something the page visibly shows after that act.";

/** The fields a failed check step adds to its feedback entry, or nothing for a step that is not a check. */
export function automationStudioTrialCheckStepFeedback(node: AutomationStudioFlowNode | undefined, attempt: AutomationStudioNodeAttemptTrace): JsonObject | undefined {
  if (attempt.status !== "failed" || !CHECK_NODE.test(attempt.definitionId)) return undefined;
  const awaited = awaitedText(node?.parameterValues);
  const detail = domainDetail(attempt);
  const near = detail?.visibleNear?.length ? ` The visible text most like it: ${detail.visibleNear.map((text) => JSON.stringify(text)).join(", ")}.` : "";
  const quoted = awaited === undefined ? undefined : JSON.stringify(awaited);
  const seen = quoted === undefined ? undefined
    : detail?.textPresence === "hidden" ? `${quoted} is on the page but stayed hidden for the whole wait, inside something closed such as a collapsed panel, a menu or a tab.${near}`
      : detail?.textPresence === "absent" ? `${quoted} is not on the page at all.${near}`
        : `The step waited for ${quoted}, and the page did not show it.${near}`;
  return {
    ...(awaited === undefined ? {} : { waitedFor: awaited }),
    ...(detail?.textPresence ? { textPresence: detail.textPresence } : {}),
    ...(detail?.visibleNear?.length ? { visibleNear: [...detail.visibleNear] } : {}),
    ...(seen ? { seen } : {}),
    advice: ADVICE
  };
}

/** The text a check waited for: a wait's `text`, or the first text an assert's conditions expect. */
function awaitedText(parameters: JsonObject | undefined): string | undefined {
  const direct = parameters?.text;
  if (typeof direct === "string") return bounded(direct, AWAITED_MAX_CHARS);
  const assert = parameters?.assert;
  const conditions = assert && typeof assert === "object" && !Array.isArray(assert) ? assert.conditions : undefined;
  if (!Array.isArray(conditions)) return undefined;
  for (const condition of conditions) {
    const expected = condition && typeof condition === "object" && !Array.isArray(condition) ? condition.expected : undefined;
    if (typeof expected === "string") return bounded(expected, AWAITED_MAX_CHARS);
  }
  return undefined;
}

/** The domain's report on the awaited text, from the action result the failed attempt's dispatch returned. */
function domainDetail(attempt: AutomationStudioNodeAttemptTrace): { textPresence?: "hidden" | "absent"; visibleNear?: string[] } | undefined {
  return readDetail(objectAt(attempt.outputs, "result", "result"));
}

function readDetail(place: unknown): { textPresence?: "hidden" | "absent"; visibleNear?: string[] } | undefined {
  if (!place || typeof place !== "object" || Array.isArray(place)) return undefined;
  const { textPresence, visibleNear } = place as Readonly<Record<string, unknown>>;
  const presence = textPresence === "hidden" || textPresence === "absent" ? textPresence : undefined;
  const near = Array.isArray(visibleNear)
    ? visibleNear.filter((item): item is string => typeof item === "string").map((item) => bounded(item, VISIBLE_NEAR_MAX_CHARS)).filter((item): item is string => item !== undefined).slice(0, VISIBLE_NEAR_MAX_ITEMS)
    : [];
  if (!presence && !near.length) return undefined;
  return { ...(presence ? { textPresence: presence } : {}), ...(near.length ? { visibleNear: near } : {}) };
}

function objectAt(value: unknown, ...path: string[]): Readonly<Record<string, unknown>> | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current && typeof current === "object" && !Array.isArray(current) ? current as Readonly<Record<string, unknown>> : undefined;
}

/** One line, whitespace collapsed, at most `max` characters; nothing for an empty text. */
function bounded(text: string, max: number): string | undefined {
  const line = text.replace(/\s+/gu, " ").trim();
  return line ? line.slice(0, max) : undefined;
}
