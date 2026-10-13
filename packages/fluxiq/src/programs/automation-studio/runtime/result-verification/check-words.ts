// The words of the result check's card, before the chat's own screen bounds them.
//
// Built from what Core knows for certain -- how many rows came back, read off
// Core's own observation (for a build's test, which stores nothing, how many
// the Flow would store), and Core's sentence for the verdict -- and, on a
// refusal, the check's reading of the request and of the result. The check is
// a model, and in live run musp39u8 (t194-w81, U6) its reading was written in
// the judge's vocabulary: "endView shows page 5 ...; reads.stop is
// control_disabled at pageLimit 5". So each of its sentences is shown only when
// it names nothing internal -- no dotted path, field or parameter name, node id,
// closed code word or hash -- and is otherwise left out whole, because a
// sentence with its names cut out no longer says anything. Its advice is never
// shown: it is the repair's instruction, written in the step's parameter names
// and node ids, and it travels to the repair unchanged (`repair-directive.ts`).

import { activityActionSentences } from "../../../../ui/index.ts";
import type { AutomationStudioResultVerification } from "./contracts.ts";

/** A dotted path or handle: `reads.stop`, `extractList.paginate.maxPages`, `node.bootstrap.….main.s7`, `extraction.4`. */
const DOTTED = /\b[A-Za-z_][\w-]+\.[A-Za-z0-9_][\w-]*/u;
/** A camelCase field or parameter name: `endView`, `pageLimit`, `leftOutOnlyByThis`. Brand casing (`iPhone`, `eBay`) is not. */
const CAMEL = /\b[a-z]{2,}[A-Z][A-Za-z0-9]*/u;
/** A snake_case code word or definition name: `control_disabled`, `extract_list`. */
const SNAKE = /\b[A-Za-z0-9]+_[A-Za-z0-9_]+/u;
/** A hash or id run: `64c205b534adb35d`. */
const HEX = /\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*[0-9])[0-9a-f]{10,}\b/u;
/** Code punctuation a sentence for a person does not carry. */
const CODE = /[`{}]/u;
const INTERNAL = [DOTTED, CAMEL, SNAKE, HEX, CODE];

/** Core's own count at the head of its observation: "13 records stored", "0 stored", "… of 13 stored". */
const STORED = /(\d+)(?: records?)? stored/u;
/**
 * The same count for a build's test, which stores nothing: what the Flow would
 * store, "30 records would be stored" (`build-test/stored-words.ts`). Live run
 * `run-muw60j7c-bb7c9a62` (C-3): the card read "no rows came back" over a Flow
 * that would store 30 rows, 3 of them twice.
 */
const WOULD_STORE = /(\d+)(?: records?)? would be stored/u;
/**
 * How many record sets a run wrote and, for more than one, each one's rows and
 * whether they are the same rows: "across 2 record sets (4, 4 rows; the same
 * rows in each)", "(4, 4 rows; 6 distinct)" (`./verdict.ts`).
 */
const SETS = /\bstored, across (\d+) record sets?(?: \(([\d, ]+) rows(?:; (the same rows in each|\d+ distinct))?\))?/u;
/**
 * How many datasets a build's Flow would write, or record sets a run wrote,
 * right after that count (`./verdict.ts`): "…, in 0 datasets", "…, across 0
 * record sets". None means the Flow stores nothing -- a cart, a form -- so it
 * has no rows to count: live run `run-muxkzdjw-31a13429` (lane A round 4)
 * carded a cart Flow "Didn't pass: no rows would be stored, and ...", as a
 * run's ending once said "It returned no rows" (`../activity/wording/run-ending.ts`).
 */
const NO_SETS = /\bstored, (?:in 0 datasets|across 0 record sets)\b/u;

/**
 * The card's text for a performed check: the rows that came back, or for a
 * build's test would be stored (where Core's observation counts them), Core's
 * verdict sentence and, when the check
 * refused the result, what it looked for and what it found, in its sentences
 * that name nothing internal. Never its advice.
 */
export function automationStudioResultCheckWords(outcome: AutomationStudioResultVerification): string {
  const judgement = outcome.verdict === "does_not_answer" ? outcome.repair?.judgement : undefined;
  const lookedFor = plain(judgement?.expected);
  const found = plain(judgement?.observed);
  return [
    ...rowsWords(outcome.observation),
    outcome.reason,
    ...(lookedFor ? [`It looked for: ${lookedFor}`] : []),
    ...(found ? [`What it found: ${found}`] : [])
  ].join(" ");
}

function rowsWords(observation: string): string[] {
  if (NO_SETS.test(observation)) return [];
  const tested = WOULD_STORE.exec(observation);
  if (tested) {
    const count = Number(tested[1]);
    return [count === 0 ? "No rows would be stored." : `${count} ${count === 1 ? "row" : "rows"} would be stored.`];
  }
  const match = STORED.exec(observation);
  if (!match) return [];
  const count = Number(match[1]);
  if (count === 0) return ["No rows came back."];
  const sets = SETS.exec(observation);
  if (sets && Number(sets[1]) > 1) return [setsWords(Number(sets[1]), sets[2], sets[3])];
  return [`${count} ${count === 1 ? "row" : "rows"} came back.`];
}

/**
 * The rows of a run that stored more than one record set, said per set and
 * never summed: each set is an answer of its own, and the same rows stored by
 * two steps are not twice the rows (live run `run-mv5jnc5m-a47c3e59`: "8 rows
 * came back" of 4 requests stored by the listing and again by the final read).
 * Without the per-set counts (`./verdict.ts`, `eachSet`), only the sets are said.
 *
 * **The same rows in every set are said once (t482).** Live run
 * `run-mv636xyp-2e4fe54d` stored the same 4 requests from the listing and from
 * the read of the accepted ones, and "4 rows came back, in each of 2 record
 * sets" read as two answers. Where Core could tell (`./verdict.ts`,
 * `distinctRows`), the card says one answer, or how many distinct rows the sets
 * hold together; where it could not, each set's count, never "in each of".
 */
function setsWords(sets: number, each: string | undefined, rowsTold: string | undefined): string {
  const counts = each?.split(", ").map(Number).filter((rows) => Number.isInteger(rows)) ?? [];
  if (counts.length !== sets) return `Rows were stored in ${sets} record sets.`;
  const rows = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;
  const perSet = `${counts.slice(0, -1).join(", ")} and ${counts.at(-1)} rows`;
  if (rowsTold === "the same rows in each") return `${rows(counts[0]!)} came back (the same rows in ${sets === 2 ? "both" : `all ${sets}`} record sets).`;
  const distinct = rowsTold === undefined ? undefined : Number.parseInt(rowsTold, 10);
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (distinct === total) return `Rows came back in ${sets} record sets: ${perSet}, no row in more than one set.`;
  if (distinct !== undefined && Number.isSafeInteger(distinct)) return `${rows(distinct)} came back across ${sets} record sets (${perSet}, some rows in more than one set).`;
  return `Rows came back in ${sets} record sets: ${perSet}.`;
}

/** The model's sentences a person may read, joined, or nothing when none survives. */
function plain(text: string | undefined): string | undefined {
  if (!text) return undefined;
  // Whole sentences: never split after "e.g." nor inside an aside (R2-U-3).
  const kept = activityActionSentences(text)
    .filter((sentence) => !INTERNAL.some((shape) => shape.test(sentence)))
    .map((sentence) => (/[.!?]["')]?$/u.test(sentence) ? sentence : `${sentence}.`));
  return kept.length ? kept.join(" ") : undefined;
}
