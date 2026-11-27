// The trail entries whose pages a judge asked on its own request is shown, in the order it is shown them (t1084), and
// the page each holds, for `./page-views.ts`.
//
// **Why.** A replay calls no decider, so its judge never continues a decider's conversation and reads no page there. Its
// trail shows each step as the domain's semantic state with the page left out (`captureOmitted`). Live run
// `run-mwz29d50-c3a32a9c` attempt 3: the replay reached the cart and read its rows, and the judge answered unknown
// because nothing it was shown held the product page the item was chosen on, with its rating and its pickup line. That
// page was in Core's hands all along, in the trail entry of the act carried from attempt 1 (`found.pageView`), and the
// replay's own steps held the pages they landed on (`found.view`).
//
// **Which, in order.**
// 1. The page each lasting act was pressed on, newest first. An entry is a lasting act where Core's record says so: its
//    act settlement (`judgeAct`), or declared consequences that applied or may have, or a step passed over as already
//    done (the same rule as the before view's, `./summary.ts`). For each: the page its own entry answered with (a press
//    that stays on its page answers with that page, as the press left it), then the page the nearest earlier entry
//    holds (where the act moved to another page, or answered none, as a replay's step passed over does). The trail runs
//    carried acts' entries first and this attempt's own after them, so newest first is this attempt's acts, then the
//    carried ones.
// 2. The page each entry landed on, newest first.
//
// An entry whose page member repeats an earlier entry's byte for byte holds a reference to it (`../run-trail/repeats.ts`,
// `{ sameAs }`); it is read as the page it names. Core never reads a line's text here: entries are told apart by Core's
// own facts, and pages are found by their shape alone (`./page-views.ts`).
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioLlmPageView } from "../../llm/view-channel/index.ts";
import type { AutomationStudioResultTrailShownStep } from "../contracts/index.ts";
import { automationStudioJudgePageOf } from "./page-of.ts";

/** One page a judge may be shown from the trail: its name (`trail.<n>`, the entry that holds it) and the page. */
export type AutomationStudioJudgeTrailPage = { name: string; page: AutomationStudioLlmPageView };

/** The pages of `entries` in the order a judge on its own request is shown them (header); a page found twice is listed where it first comes. */
export function automationStudioJudgeTrailPages(entries: readonly AutomationStudioResultTrailShownStep[] | undefined): AutomationStudioJudgeTrailPage[] {
  if (!entries?.length) return [];
  const holders = new Map(entries.map((entry) => [entry.callId ?? `n:${entry.n}`, entry]));
  const held = entries.map((entry) => automationStudioJudgePageOf(found(entry, holders)));
  const named = (at: number): AutomationStudioJudgeTrailPage | undefined => (held[at] === undefined ? undefined : { name: `trail.${entries[at]!.n}`, page: held[at]! });
  const pages: AutomationStudioJudgeTrailPage[] = [];
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    if (!lasting(entries[at]!)) continue;
    pages.push(...[named(at), named(earlier(held, at))].filter((page): page is AutomationStudioJudgeTrailPage => page !== undefined));
  }
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const page = named(at);
    if (page !== undefined) pages.push(page);
  }
  return pages.filter((page, at) => pages.findIndex((other) => other.name === page.name) === at);
}

/** Whether Core's record says `entry` was a lasting act (header). */
function lasting(entry: AutomationStudioResultTrailShownStep): boolean {
  if (entry.judgeAct !== undefined) return true;
  const facts = entry.framework;
  if (!Array.isArray(facts?.consequences) || facts.consequences.length === 0) return false;
  return facts.effectApplied !== false || object(facts.failure)?.effect === "ambiguous" || object(facts.skipped) !== undefined;
}

/** The nearest entry before `at` that holds a page, or -1. */
function earlier(held: readonly (AutomationStudioLlmPageView | undefined)[], at: number): number {
  for (let before = at - 1; before >= 0; before -= 1) if (held[before] !== undefined) return before;
  return -1;
}

/** What `entry` found, each member that repeats an earlier entry's read as that entry's member (header); undefined where it found nothing. */
function found(entry: AutomationStudioResultTrailShownStep, holders: ReadonlyMap<string, AutomationStudioResultTrailShownStep>): JsonObject | undefined {
  const value = object(entry.found);
  if (value === undefined || !Object.keys(value).length) return undefined;
  return Object.fromEntries(Object.entries(value).map(([name, member]) => {
    const reference = object(member);
    const holder = typeof reference?.sameAs === "string" && Object.keys(reference).length === 1 ? holders.get(reference.sameAs) : undefined;
    const original = holder === undefined ? undefined : object(holder.found)?.[name];
    return [name, original ?? member];
  }));
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
