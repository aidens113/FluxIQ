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
  return [`${count} ${count === 1 ? "row" : "rows"} came back.`];
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
