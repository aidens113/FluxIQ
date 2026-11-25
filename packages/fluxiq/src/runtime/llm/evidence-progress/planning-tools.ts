// What a loop whose model plans, rather than acts on the target, tells the loop
// about its own way forward (t569).
//
// **Why this exists.** The first live `project` build (`run-mv7t07hx-fe96a174`,
// crossborder) had its supervisor read the task and then make seven finds and a
// describe on the unchanged start page, never writing a plan, until the run of
// looks stalled the round. Every note the loop put in front of it said what a
// builder is told -- "act on what you found: press, type into or choose a
// control", "run a step that produces what the instruction asks for" -- and a
// supervisor has no such move: its way forward is a tool of its own. A loop
// that names its finishing tools for its notes (`finishingTools`, t537) is the
// pattern this follows: the loop holds no branch for any one caller, it reads
// what the caller says its tools are and says the caller's own sentence.
//
// - `toolIds`: the tools that move the work forward, which the loop never
//   takes for a look, whatever their effect. No look is ever withdrawn or
//   counted against a budget (page-diff D4, D11).
// - `next()`: the way forward now, asked each time a note is written -- the
//   tool to call, when there is one, and the caller's sentence saying so. The
//   no-progress redirect (`./stall-redirect.ts`), the searching note
//   (`../decision-handlers/searching.ts`) all say it in place of the words that send a builder to act.

/** The way forward a planning loop's notes name: its tool, when there is one, and the caller's own sentence. */
export type AutomationStudioLlmEvidencePlanningStep = { toolId?: string | undefined; instruction: string };

export type AutomationStudioLlmEvidencePlanningTools = {
  /** The tools that move the work forward: never taken for looks. */
  toolIds: readonly string[];
  /** The way forward now, asked each time a note says it. */
  next(): AutomationStudioLlmEvidencePlanningStep;
};
