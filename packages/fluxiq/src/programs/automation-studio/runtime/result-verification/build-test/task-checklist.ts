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
//
// **A subflow trial is told the other subflows' parts (t594).** On A8 launch 7
// (crossborder) the first subflow's builder also wrote the next subflow's
// lasting press into its own, and both judges answered yes: they were told the
// trial's own parts alone, and the press was asked by the person's
// instructions, just not of that subflow, so "anything no part and no
// instruction asks" did not catch it. A subflow trial's checklist now carries
// the task's other parts (`outOfScope`), and its label says a step that does
// one of them is outside the subflow, so such a trial is judged no. A whole
// trial's checklist has none, and its section is byte for byte what it was.
//
// **But not the steps Core ran to prepare the entry (t599).** A8 social
// `run-mv8ic6mk-09bf12ff`: a subflow trial runs its predecessors inside it, and
// the out-of-scope rule told the judges to answer no to the predecessor's
// presses Core itself put there, and to "remove" a call no builder can remove.
// So a subflow trial with predecessors carries them (`entry`: their keys, and
// every step of theirs by nodeId), the out-of-scope rule holds the subflow's
// own steps alone, and the label says the entry's steps are setup, judged in
// their own trials. The same `entry` takes their reads out of the rows a yes
// accounts for (`../request-rows/summary-reads.ts`). A trial with no
// predecessors, and a whole trial, is told exactly what it was.

import type { AutomationStudioResultTaskChecklist, AutomationStudioRunResultSummary } from "../contracts.ts";

/** What the instructions ask, part by part, and what they do not ask: the build's own reading, never the request. */
export type AutomationStudioBuildTestTaskChecklist = {
  /** Each part: its id, the instructions' own words for it, the facts true once it is done and the lasting acts it needs. */
  parts: ReadonlyArray<{ id: string; words: string; goalFacts: readonly string[]; lastingActs: readonly string[] }>;
  /** What the instructions do not ask for. */
  notAsked: readonly string[];
  /** A subflow trial's only: the task's other parts, each another subflow's work, by id and the instructions' own words (header, t594). */
  outOfScope?: ReadonlyArray<{ id: string; words: string }> | undefined;
  /** A subflow trial's only: the earlier subflows Core ran in it to prepare its entry, by key, and every step of theirs, by nodeId (header, t599). */
  entry?: { subflows: readonly string[]; steps: readonly string[] } | undefined;
};

/** The section's own label: what it is, that the instructions win, and how the judge uses it. */
const SUPPLEMENTARY = "Supplementary to the instructions, never instead of them: the build's own reading of what the instructions ask, part by part (asked: each part's id, the instructions' own words for it, the facts that hold once it is done and the lasting acts it needs), and of what they do not ask (notAsked). The instructions are the only authority: where this checklist and the instructions differ, judge by the instructions. Check the result against the instructions part by part with it: a part no step does is not done, and a result that a filter, condition or exclusion narrows, or that carries a column or makes a lasting act, which the instructions do not ask for -- what notAsked names, or anything no part and no instruction asks -- does not do what was asked. Steps that only reach what a part asks for, such as opening a page or searching for the item asked for, are no such addition.";

/** Said after the label when a subflow trial's checklist names other subflows' parts (header, t594); `step` is which steps the rule holds: with an entry, this subflow's own (t599). */
const outOfScopeSaid = (step: string): string => "This trial ran one subflow of a larger Flow, and asked holds that subflow's parts alone. outOfScope holds the other parts of the same instructions, each another subflow's work, done before or after this one: "
  + `this trial is not asked to do them, and the instructions asking for them elsewhere does not make them this subflow's. ${step} that does what an outOfScope part asks -- above all a lasting act -- is outside this subflow, `
  + "and a trial with such a step does not do what was asked: answer no, and name that step and the part it does. Steps that only reach what an asked part needs are no such step.";
const OUT_OF_SCOPE = outOfScopeSaid("A step of this trial");
const OUT_OF_SCOPE_WITH_ENTRY = outOfScopeSaid("A step of this subflow, one entry.steps does not hold,");

/** Said last when earlier subflows ran in the trial to prepare its entry (header, t599). */
const ENTRY = "Before this subflow, this trial ran the subflows entry.subflows names, which prepare its entry: Core put them in the trial, and each was judged in its own trial. "
  + "entry.steps holds, by nodeId, every step of theirs and the steps that called them: none of them is this subflow's step. "
  + "What they read, kept, left out or pressed, a lasting act among them, is not this subflow's doing: it is never a reason to answer no, never a step to remove or change, and a yes need not account for the rows their reads kept or left out. "
  + "Judge this subflow by its own steps, from the page those steps found.";

/** `summary` with the checklist as its labelled supplementary section, `taskChecklist`; the summary itself is not changed. */
export function automationStudioBuildTestSummaryWithTaskChecklist(summary: AutomationStudioRunResultSummary, checklist: AutomationStudioBuildTestTaskChecklist): AutomationStudioRunResultSummary {
  const outOfScope = checklist.outOfScope ?? [];
  const entry = checklist.entry?.steps.length ? checklist.entry : undefined;
  const said = [SUPPLEMENTARY, ...(outOfScope.length ? [entry ? OUT_OF_SCOPE_WITH_ENTRY : OUT_OF_SCOPE] : []), ...(entry ? [ENTRY] : [])];
  const taskChecklist: AutomationStudioResultTaskChecklist = {
    supplementary: said.join(" "),
    asked: checklist.parts.map((part) => ({ part: part.id, words: part.words, goalFacts: [...part.goalFacts], lastingActs: [...part.lastingActs] })),
    notAsked: [...checklist.notAsked]
  };
  if (outOfScope.length) taskChecklist.outOfScope = outOfScope.map((part) => ({ part: part.id, words: part.words }));
  if (entry) taskChecklist.entry = { subflows: [...entry.subflows], steps: [...entry.steps] };
  return { ...summary, taskChecklist };
}
