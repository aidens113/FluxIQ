// What a step of the draft already is, in the draft entry's own words and numbers, for an amendment that changed nothing
// because the step is already so (t1078, live run `run-mwyt3s48-b943f344`: the same applied repeat and result were sent
// three more times, each refused as already so, and the refusal named neither what was so nor how the step stood).

import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";

/** The step a routing names, by the id the draft gives it (`p<position>` for a step built without one), as its number. */
function numberOf(id: string | undefined, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const step = id === undefined ? undefined : steps.find((candidate) => (candidate.id ?? `p${candidate.position}`) === id);
  return step ? String(step.position) : "a step no longer in the draft";
}

/**
 * What step `n` is as the draft stands: whether it is in the Flow, how it runs and whether it holds the result. An empty
 * list when the step is not in the draft, or the draft carries too little of it to say.
 */
function standsAs(n: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string[] {
  const step = steps.find((candidate) => candidate.position === n);
  if (!step) return [];
  const facts: string[] = [];
  if (step.disposition === "kept") facts.push("is in the Flow");
  else if (step.disposition !== undefined) facts.push("is out of the Flow");
  const routing = step.routing;
  if (routing?.kind === "repeat") {
    facts.push(routing.while !== undefined
      ? `repeats through step ${numberOf(routing.through, steps)} while it succeeds`
      : `repeats through step ${numberOf(routing.through, steps)}, over step ${numberOf(routing.over, steps)}`);
  } else if (routing) facts.push(`runs under the condition ${routing.kind}`);
  if (step.result === true) facts.push("holds the result");
  return facts;
}

/** The sentence for an `already_so` refusal: what the step already is, so that sending the change again has no reason. */
export function alreadySoWords(n: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const facts = standsAs(n, steps);
  const now = facts.length ? ` Step ${n} as the draft holds it now: it ${facts.join(", it ")}.` : "";
  return `The draft already holds exactly what that amendment says for step ${n}, so it changed nothing and sending it again changes nothing.${now}`;
}
