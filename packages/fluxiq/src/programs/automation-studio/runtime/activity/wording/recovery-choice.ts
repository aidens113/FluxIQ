type Choice = { title: string; text: string };

/** What each rung of the run's recovery ladder does, and why, in a person's words. */
const RETRY: Readonly<Record<string, Choice>> = Object.freeze({
  retry_node: { title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more." },
  await_recorded_state: { title: "Waiting for the page to catch up", text: "The page wasn't yet the way this step expects, so FluxIQ waited for it and is trying the step again." },
  clear_interference: { title: "Clearing what was in the way", text: "Something on the page was in the way of the step, so FluxIQ dealt with it and is trying the step again." }
});

const SATISFIED: Choice = { title: "Moving on: the step's result is already there", text: "What this step was meant to do has already happened on the page, so FluxIQ carries on without repeating it." };
const STOP: Choice = { title: "The quick fixes didn't help", text: "Trying again didn't fix the step, so the run follows what the Flow says to do when this step fails." };

/**
 * What the run's recovery ladder chose for a failed step, as a thought a
 * person reads: a title naming the choice and a sentence saying why. The
 * ladder is Core's, not the model's, so these are Core's own words.
 */
export function automationStudioActivityRecoveryChoice(outcome: { kind: string; rung?: string | undefined }): Choice {
  if (outcome.kind === "retry") return RETRY[outcome.rung ?? "retry_node"] ?? RETRY.retry_node!;
  if (outcome.kind === "satisfied") return SATISFIED;
  return STOP;
}
