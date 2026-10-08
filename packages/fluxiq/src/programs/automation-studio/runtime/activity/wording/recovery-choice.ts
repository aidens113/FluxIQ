type Choice = { title: string; text: string };

/** What each rung of the run's recovery ladder does, and why, in a person's words. */
const RETRY: Readonly<Record<string, Choice>> = Object.freeze({
  retry_node: { title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more." },
  await_recorded_state: { title: "Waiting for the page to catch up", text: "The page wasn't yet the way this step expects, so FluxIQ waited for it and is trying the step again." },
  clear_interference: { title: "Clearing what was in the way", text: "Something on the page was in the way of the step, so FluxIQ dealt with it and is trying the step again." }
});

const SATISFIED: Choice = { title: "Moving on: the step's result is already there", text: "What this step was meant to do has already happened on the page, so FluxIQ carries on without repeating it." };

/**
 * The ladder's end, by why it pressed the step no more. Trying again is said
 * only of a step that was tried again, and no other end says it: lane A
 * round 5 (`run-muz0f12h-eae63685`, t366) read "The quick fixes didn't help:
 * Trying again didn't fix the step" for an Add to cart the page refused, which
 * nothing pressed a second time.
 * `{work}` is the run, or the test when a build runs its Flow to test it.
 */
const NOT_TRIED_AGAIN = "Not repeating the step";
const STOPPED: Readonly<Record<"uncertain" | "tried_again" | "out_of_time" | "not_retryable" | "unknown", Choice>> = Object.freeze({
  uncertain: { title: NOT_TRIED_AGAIN, text: "FluxIQ can't tell whether the step went through, and repeating it could do it twice, so the {work} follows what the Flow says to do when this step fails." },
  tried_again: { title: "Trying again didn't help", text: "FluxIQ tried the step again and it still didn't work, so the {work} follows what the Flow says to do when this step fails." },
  out_of_time: { title: NOT_TRIED_AGAIN, text: "The {work} has already waited as long as it may, so it follows what the Flow says to do when this step fails." },
  not_retryable: { title: NOT_TRIED_AGAIN, text: "Another try wouldn't change what happened, so the {work} follows what the Flow says to do when this step fails." },
  unknown: { title: NOT_TRIED_AGAIN, text: "The step didn't work, so the {work} follows what the Flow says to do when this step fails." }
});

/**
 * What the run's recovery ladder chose for a failed step, as a thought a
 * person reads: a title naming the choice and a sentence saying why. The
 * ladder is Core's, not the model's, so these are Core's own words.
 *
 * `run` is what the run knows of the step when the ladder stops, read only for
 * these words (`../../executor/graph-run.ts`): whether its failure left a
 * lasting act's outcome unknown; how many times it was attempted at this
 * arrival, the failed attempt included; whether the run may still wait and try
 * again; whether a retry may absorb the failure; and whether the run is a
 * build's test of its Flow. Without it, a stop says nothing of why.
 */
export function automationStudioActivityRecoveryChoice(
  outcome: { kind: string; rung?: string | undefined },
  run: { attempts?: number; actUncertain?: boolean; mayAbsorb?: boolean; retryable?: boolean; test?: boolean } = {}
): Choice {
  if (outcome.kind === "retry") return RETRY[outcome.rung ?? "retry_node"] ?? RETRY.retry_node!;
  if (outcome.kind === "satisfied") return SATISFIED;
  const stop = run.actUncertain === true ? STOPPED.uncertain
    : (run.attempts ?? 1) > 1 ? STOPPED.tried_again
    : run.mayAbsorb === false ? STOPPED.out_of_time
    : run.retryable === false ? STOPPED.not_retryable
    : STOPPED.unknown;
  return { title: stop.title, text: stop.text.replace("{work}", run.test === true ? "test" : "run") };
}
