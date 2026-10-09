// What a step absorbed on its way to its outcome, for the trial feedback (t378).
//
// Lane D (`run-mv0fuual-f9e6f089`, 0036): two Confirm presses were refused by
// the site's "you're going too fast" notice, waited out and pressed again, and
// the model was told only `attempts: 2`. The refusal, the row the loop was on,
// the wait and what the run did next were all in the trace, one attempt
// earlier, and the feedback folded them away. Each refused attempt a step got
// past is now said in plain words: what interrupted it, on which pass and row,
// how long the run waited, that the step then went through, and the pace the
// run held the step to from then on. Read from Core's own records only -- the
// failure's code and wait hint, the retry's wait, the pace the run learned --
// never from the failure's message, which can quote the page.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE, automationStudioRetryHintMs, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { automationStudioTrialFailureHappened } from "./happened.ts";

/** The most absorbed refusals one step lists; a node makes at most four attempts at one arrival. */
const MAX_ABSORBED = 4;

/** The longest row words a pass is named by. */
const MAX_ROW_CHARS = 60;

/** The keys a row's own name is read from, in order; a row with none of them is named by its pass number only. */
const ROW_NAME_KEYS: readonly string[] = ["name", "title", "label", "text", "heading"];

/**
 * Each refused attempt a step got past, in order: `failed` the refused attempt,
 * `retry` the attempt the run made next. `pass` is the outputs of the loop
 * pass the step ran in (`index`, `count`, `item`), when it ran in one.
 */
export function automationStudioTrialAbsorbedFeedback(input: {
  absorbed: ReadonlyArray<{ failed: AutomationStudioNodeAttemptTrace; retry: AutomationStudioNodeAttemptTrace }>;
  pass?: Readonly<Record<string, JsonValue>> | undefined;
}): JsonObject[] {
  const where = passOf(input.pass);
  return input.absorbed.slice(0, MAX_ABSORBED).map(({ failed, retry }) => {
    const askedMs = failed.fault?.hintedWaitMs ?? retry.retry?.hintedWaitMs ?? (failed.failure ? automationStudioRetryHintMs(failed.failure, failed.finishedAt ?? failed.startedAt) : undefined);
    const waitedMs = retry.retry?.backoffMs;
    const creditedMs = retry.retry?.creditedMs;
    const paceMs = failed.pace?.raisedToMs;
    const wentThrough = retry.status === "succeeded";
    const onPass = where.pass === undefined ? "" : ` on pass ${where.pass}${where.row ? ` (${where.row})` : ""}`;
    const happened = askedMs !== undefined
      ? `The site asked the run to slow down${onPass}, and to try again in ${seconds(askedMs)}.`
      : `${automationStudioTrialFailureHappened(failed.failure?.category ?? "action_failed").replace(/\.$/u, "")}${onPass}.`;
    const then = waitedMs !== undefined
      ? `The run waited ${seconds(waitedMs)}${creditedMs ? ` (${seconds(creditedMs)} had already passed since the refusal)` : ""} and tried the step again${wentThrough ? ": it went through, so what the site had shown no longer stood in its way" : ""}.`
      : wentThrough ? "The run tried the step again and it went through." : undefined;
    const paced = paceMs === undefined ? undefined : `From then on the run started this step at most once every ${seconds(paceMs)}.`;
    return compact({
      failureCode: failed.failure?.code ?? failed.fault?.code,
      happened,
      pass: where.pass,
      row: where.row,
      askedWaitMs: askedMs,
      waitedMs,
      paceMs,
      said: [happened, then, paced].filter((sentence): sentence is string => sentence !== undefined).join(" ")
    });
  });
}

/** The pass number, counting from one, and the row's own words when it has some that are not withheld. */
function passOf(outputs: Readonly<Record<string, JsonValue>> | undefined): { pass?: number; row?: string } {
  const index = outputs?.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return {};
  const row = rowWords(outputs?.item);
  return { pass: index + 1, ...(row ? { row } : {}) };
}

function rowWords(item: JsonValue | undefined): string | undefined {
  const named = item && typeof item === "object" && !Array.isArray(item) ? ROW_NAME_KEYS.map((key) => item[key]).find((value) => typeof value === "string" && value.trim() !== "") : item;
  if (typeof named === "number" && Number.isFinite(named)) return String(named);
  if (typeof named !== "string") return undefined;
  const words = named.replace(/\s+/gu, " ").trim();
  return words && words !== AUTOMATION_STUDIO_WITHHELD_VALUE && !words.includes(AUTOMATION_STUDIO_WITHHELD_VALUE) ? words.slice(0, MAX_ROW_CHARS) : undefined;
}

function seconds(ms: number): string {
  return `${(ms / 1_000).toFixed(1)} s`;
}

function compact(value: Record<string, string | number | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ""));
}
