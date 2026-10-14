// The task checklist a project build's judge reads beside the instructions
// (automation-project-agents-plan, Contracts, `Task spec`; unit A9).
//
// A project build's supervisor splits the instructions into parts, each the
// person's own words with the facts that hold once it is done and the lasting
// acts it needs, and names what nobody asked for (`notAsked`). The judge is
// still given the original instructions as the request; this is a clearly
// labelled supplementary section of the summary it judges, so a result that a
// filter, condition or exclusion narrows, or that carries a column, which the
// instructions never ask for is judged against what they do and do not ask.
//
// It sits at the top of the summary, never inside `buildTest`: the harness
// refuses any locator-shaped string anywhere in `buildTest`
// (`llm/harness/request-evidence-check.ts`), and the person's own words may
// hold one, which would leave the test unjudged. The section explains itself,
// first, in `supplementary`, because the judge's standing instruction
// (`llm/diagnosis-instructions.ts`) does not name it.
//
// Without a checklist nothing is added: a candidate build's judge is sent
// exactly the summary it was sent before (`./judge.ts`).

import type { AutomationStudioResultTaskChecklist, AutomationStudioRunResultSummary } from "../contracts.ts";

/** What the instructions ask, part by part, and what they do not ask: the build's own reading, never the request. */
export type AutomationStudioBuildTestTaskChecklist = {
  /** Each part: its id, the instructions' own words for it, the facts true once it is done and the lasting acts it needs. */
  parts: ReadonlyArray<{ id: string; words: string; goalFacts: readonly string[]; lastingActs: readonly string[] }>;
  /** What the instructions do not ask for. */
  notAsked: readonly string[];
};

/** The section's own label: what it is, that the instructions win, and how the judge uses it. */
const SUPPLEMENTARY = "Supplementary to the instructions, never instead of them: the build's own reading of what the instructions ask, part by part (asked: each part's id, the instructions' own words for it, the facts that hold once it is done and the lasting acts it needs), and of what they do not ask (notAsked). The instructions are the only authority: where this checklist and the instructions differ, judge by the instructions. Check the result against the instructions part by part with it: a part no step does is not done, and a result that a filter, condition or exclusion narrows, or that carries a column or makes a lasting act, which the instructions do not ask for -- what notAsked names, or anything no part and no instruction asks -- does not do what was asked. Steps that only reach what a part asks for, such as opening a page or searching for the item asked for, are no such addition.";

/** `summary` with the checklist as its labelled supplementary section, `taskChecklist`; the summary itself is not changed. */
export function automationStudioBuildTestSummaryWithTaskChecklist(summary: AutomationStudioRunResultSummary, checklist: AutomationStudioBuildTestTaskChecklist): AutomationStudioRunResultSummary {
  const taskChecklist: AutomationStudioResultTaskChecklist = {
    supplementary: SUPPLEMENTARY,
    asked: checklist.parts.map((part) => ({ part: part.id, words: part.words, goalFacts: [...part.goalFacts], lastingActs: [...part.lastingActs] })),
    notAsked: [...checklist.notAsked]
  };
  return { ...summary, taskChecklist };
}
