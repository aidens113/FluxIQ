// Steps whose options each match one word of the same part of the request, in
// different groups of the site's filters (t686).
//
// **Why.** A8 cost round `run-mvblov2i-abb7d82e`: two steps chose one option
// each in two separate filter groups, and each option was one word of a single
// clause of the request that asks for both together, of one row. Core's
// recheck said of each "the request itself says" that word, so it vouched for
// two independent facets as if together they were the clause; they were not --
// rows meeting each facet apart, and not the clause, were kept.
//
// **What Core measures, and only that.** The request is cut into clauses at
// sentence ends, semicolons and commas. Where two or more steps in different
// groups each chose an option whose request words (`./narrowing.ts`) are one
// word, and those words fall in one clause with at most `NEAR` words between
// each and the next -- one phrase of the request, "outdoor seating this
// weekend", not "Thai restaurant ... with outdoor seating" -- each such step is
// a split facet: Core states what it chose and the page's counts, never that
// the request says its option, and says that a site filter's option words do
// not show each kept row meets that phrase; a row's own text does.

import type { AutomationStudioResultNarrowingStep } from "../contracts/index.ts";

/** A step that is a split facet: the phrase of the request, and the other steps choosing words of it. */
export type AutomationStudioResultSplitFacet = { clause: string; others: AutomationStudioResultNarrowingStep[] };

/** The most words between two options' words for them to be one phrase of the request. */
const NEAR = 4;

/** A word of the request, with the letters, digits and inner marks it is spelled with. */
const WORD = /[\p{L}\p{N}]+(?:['’&-][\p{L}\p{N}]+)*/gu;

/** Each split facet among `steps`, by node id (header); `wordsOf` gives a step's request words, nothing where its option is not the request's. */
export function automationStudioResultSplitFacets(
  steps: readonly AutomationStudioResultNarrowingStep[],
  requestText: string,
  wordsOf: (step: AutomationStudioResultNarrowingStep) => readonly string[] | undefined
): Map<string, AutomationStudioResultSplitFacet> {
  const facets = new Map<string, AutomationStudioResultSplitFacet>();
  for (const clause of requestText.split(/[.;!?\n]+|,\s+/u)) {
    const words = [...clause.matchAll(WORD)];
    // Each step whose one request word is in this clause, at its first place there.
    const placed = steps.flatMap((step) => {
      const own = step.group ? wordsOf(step) : undefined;
      const word = own?.length === 1 ? own[0]!.trim().toLowerCase() : undefined;
      const at = word && !/\s/u.test(word) ? words.findIndex((match) => match[0].toLowerCase() === word) : -1;
      return at < 0 ? [] : [{ step, at }];
    }).sort((one, two) => one.at - two.at);
    // Runs of them, each word at most `NEAR` words after the one before.
    const runs: Array<typeof placed> = [];
    for (const one of placed) {
      const run = runs.at(-1);
      if (run && one.at - run.at(-1)!.at <= NEAR + 1) run.push(one);
      else runs.push([one]);
    }
    for (const run of runs) {
      if (new Set(run.map(({ step }) => step.group)).size < 2) continue;
      const first = words[run[0]!.at]!;
      const last = words[run.at(-1)!.at]!;
      const phrase = clause.slice(first.index, last.index! + last[0].length);
      for (const { step } of run) {
        if (!facets.has(step.nodeId)) facets.set(step.nodeId, { clause: phrase, others: run.map((other) => other.step).filter((other) => other.group !== step.group) });
      }
    }
  }
  return facets;
}
