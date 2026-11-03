// A kept row called not asked by the words the request searched by, where the
// request asks for every result its search shows (framework plan P5; debug
// `run-mvtdoyf3-47ffaac1`, fix F3, a judgement call).
//
// **Why.** The request asked to search for a kind of thing and collect every
// search result on the first page, less one exclusion it stated. Both judges
// of the correct revision said no over one kept row, a `kept_not_asked`
// defect quoting the search clause alone. The row was stored and the quote ran
// in the request, so the defect was located and the double no stood; the
// revision was locked, and the build could only add exclusions. The searched
// words said where to look, not a kind every row must be: under a request for
// every result, a row whose own label says those words cannot be failing them.
//
// **So such a defect is not located** where all of these hold:
//
// - the request's own words ask for every result it looks through
//   (`../asked-words/every-result.ts`), so a request for a kind of thing
//   ("Find garden gloves and list them", t628) is read as before;
// - the defect's `requestWords` state no exclusion of their own (leaving out,
//   excluding, except, without, not, ...): a row saying excluded words is what
//   those words exclude;
// - the request phrases those words hold -- each run of two or more of their
//   words that is a phrase of the request (`../request-rows/request-phrases.ts`)
//   and that some row Core holds says -- are at least one, and the row's own
//   label says every one of them.
//
// Words of the clause no row says ("the catalog", "search the") name where the
// search ran and are not held to a row. Where Core holds no phrases of the
// request, or no request text, the defect is located as before. Such a no is
// then re-asked once (`../agreement/unsupported-no.ts`).

import type { AutomationStudioLlmVerificationDefect } from "../../llm/index.ts";
import type { AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestAsksEveryResult } from "../asked-words/index.ts";
import { automationStudioRequestRowWords, type AutomationStudioRequestRowWord } from "../request-rows/index.ts";

/** Words that state an exclusion: a quote holding one excludes by it, and is held to the row as before. */
const EXCLUDES = /\b(?:leav(?:e|es|ing)\b[^.;]*?\bout|left\s+out|exclud\w*|except\w*|without|not|no|non|omit\w*|skip\w*|ignor\w*|other\s+than|apart\s+from|besides|but)\b/iu;

/**
 * Core's words for a `kept_not_asked` defect over a stored row whose own label
 * says every request phrase its quote holds, under a request for every result
 * (header); nothing where any part of that does not hold, and the defect is
 * located as before. `label` is the row's label as Core's record names it,
 * `quoted` the defect's row as Core's lines quote it.
 */
export function automationStudioResultKeptSearchedWordsOnly(
  defect: AutomationStudioLlmVerificationDefect,
  label: string | undefined,
  quoted: string,
  record: Pick<AutomationStudioResultNoRecord, "phrases" | "stored" | "leftOut" | "seenLabels" | "pools">,
  requestText: string | undefined
): string | undefined {
  if (defect.kind !== "kept_not_asked" || label === undefined || !record.phrases) return undefined;
  if (!automationStudioRequestAsksEveryResult(requestText) || EXCLUDES.test(defect.requestWords)) return undefined;
  const phrases = record.phrases;
  const labels = [...new Set([...record.stored.map((one) => one.label), ...record.leftOut.map((one) => one.label), ...(record.seenLabels ?? []), ...record.pools.flat()])].map(automationStudioRequestRowWords);
  const quote = automationStudioRequestRowWords(defect.requestWords);
  const held = new Map<string, string>();
  for (let start = 0; start < quote.length; start += 1) {
    for (let end = start + 2; end <= quote.length && quote[end - 1]!.segment === quote[start]!.segment; end += 1) {
      const run = quote.slice(start, end).map((word) => word.word);
      if (phrases.isPhrase(run) && labels.some((words) => says(words, run))) held.set(run.join(" "), phrases.said(run));
    }
  }
  if (!held.size) return undefined;
  const own = automationStudioRequestRowWords(label);
  if (![...held.keys()].every((key) => says(own, key.split(" ")))) return undefined;
  // Said by the longest phrases only: a phrase inside another the label says is said with it.
  const keys = [...held.keys()];
  const longest = keys.filter((key) => !keys.some((other) => other !== key && ` ${other} `.includes(` ${key} `)));
  const named = [...new Set(longest.map((key) => held.get(key)!))].map((phrase) => `"${phrase}"`).join(", ");
  return `${quoted} is a row the result keeps, and the request asks for every result it looks through: the row's own label says ${named}, so "${defect.requestWords}" say where the request looked, not words that row fails. Quote the request's words that exclude it, if any do.`;
}

/** Whether `run` runs word for word, inside one segment, in a text's words. */
function says(words: readonly AutomationStudioRequestRowWord[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (words[start + run.length - 1]!.segment !== words[start]!.segment) continue;
    if (run.every((word, index) => words[start + index]!.word === word)) return true;
  }
  return false;
}
