// Rows a condition alone left out that, by their own words, are the item the
// request asks for.
//
// **Why.** Live run `run-muw60j7c-bb7c9a62` (debug C-2): both build-test judges
// answered yes, though the read's `name` condition alone had left out
//
//   Lumo Audio Drift Pro Wireless Earbuds, ..., Wireless Charging Case, ...
//   Aurelle Pods Fit Wireless Earbuds, ..., Ivory with Wireless Charging Case
//   Trevio T5 Wireless Earbuds, ..., Wireless Charging Case, ...
//
// beside two real accessories, and the judge's instructions already said an
// item sold with an excluded part is still the item. The rows were in front of
// the judge; nothing made it account for them.
//
// **The rule, and nothing read from a model.** Per read: the request phrase
// every kept row names first is the item ("wireless earbuds"). A row is flagged
// when one condition alone left it out, that condition tested the row's own label
// (`types.ts`, `testedLabel`), and its label names the item first and another of
// the request's phrases only after it ("charging cases"). The two accessories
// above are not flagged: "Replacement Ear Tips for Wireless Earbuds" and
// "Charging Case Replacement for ... Wireless Earbuds" name their excluded phrase
// first. A row the result holds anyway is not flagged: it is not missing.
//
// It flags; it does not judge. Whether the request excludes a flagged row is the
// judge's to say, and `verdict.ts` holds a yes to saying it row by row.

import type { AutomationStudioResultLeftOutNamingTheItem, AutomationStudioRunResultSummary } from "../contracts.ts";
import { automationStudioRequestPhrases, type AutomationStudioRequestPhrases } from "./request-phrases.ts";
import { automationStudioRequestRowsReads } from "./summary-reads.ts";
import type { AutomationStudioRequestRowsRead } from "./types.ts";

/** Each condition's left-out rows that name the item first and another request phrase after it, per read; none when there are none. */
export function automationStudioResultLeftOutNamingTheItem(summary: AutomationStudioRunResultSummary, requestText: string): AutomationStudioResultLeftOutNamingTheItem[] {
  const phrases = automationStudioRequestPhrases(requestText);
  return automationStudioRequestRowsReads(summary).reads.flatMap((read) => flagged(read, phrases));
}

function flagged(read: AutomationStudioRequestRowsRead, phrases: AutomationStudioRequestPhrases): AutomationStudioResultLeftOutNamingTheItem[] {
  const item = itemOf(read.kept, phrases);
  if (!item) return [];
  const inResult = new Set(read.inResult);
  const found: AutomationStudioResultLeftOutNamingTheItem[] = [];
  for (const condition of read.conditions) {
    if (!condition.testedLabel) continue;
    const also: string[] = [];
    const rows = condition.rows.filter((row, index) => {
      if (inResult.has(condition.labels[index]!)) return false;
      const [first, ...after] = phrases.phrasesOf(condition.labels[index]!);
      if (!first || !startsWith(first.words, item)) return false;
      const others = after.filter((phrase) => !startsWith(phrase.words, item)).map((phrase) => phrases.said(phrase.words));
      also.push(...others);
      return others.length > 0;
    });
    if (rows.length) {
      found.push({
        ...(read.step !== undefined ? { step: read.step } : {}),
        ...(read.nodeId !== undefined ? { nodeId: read.nodeId } : {}),
        condition: condition.condition,
        item: phrases.said(item),
        also: [...new Set(also)],
        rows
      });
    }
  }
  return found;
}

/**
 * The phrase every kept row names first: the words the first phrases of all of
 * them begin with, when that is itself a request phrase. None when a kept row
 * names no phrase, or they do not agree.
 */
function itemOf(kept: readonly string[], phrases: AutomationStudioRequestPhrases): string[] | undefined {
  if (!kept.length) return undefined;
  let common: string[] | undefined;
  for (const label of kept) {
    const first = phrases.phrasesOf(label)[0];
    if (!first) return undefined;
    common = common === undefined ? first.words : commonStart(common, first.words);
    if (common.length < 2) return undefined;
  }
  return common && phrases.isPhrase(common) ? common : undefined;
}

function commonStart(left: readonly string[], right: readonly string[]): string[] {
  const shared: string[] = [];
  for (let index = 0; index < Math.min(left.length, right.length) && left[index] === right[index]; index += 1) shared.push(left[index]!);
  return shared;
}

function startsWith(words: readonly string[], start: readonly string[]): boolean {
  return start.length <= words.length && start.every((word, index) => words[index] === word);
}
