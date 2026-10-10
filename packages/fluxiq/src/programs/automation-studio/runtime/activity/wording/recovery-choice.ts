type Choice = { title: string; text: string };

/** What each rung of the run's recovery ladder does, and why, in a person's words. */
const RETRY: Readonly<Record<string, Choice>> = Object.freeze({
  retry_node: { title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more." },
  await_recorded_state: { title: "Waiting for the page to catch up", text: "The page wasn't yet the way this step expects, so FluxIQ waited for it and is trying the step again." },
  clear_interference: { title: "Clearing what was in the way", text: "Something on the page was in the way of the step, so FluxIQ dealt with it and is trying the step again." }
});

/**
 * A retry the site itself asked to wait for: a slow-down notice ("You're going
 * too fast") or a wait it named (`retryAfterMs`). Lane D (`run-mv0fuual-f9e6f089`)
 * read "The step didn't work, and a step like this often works on a second
 * try" while the site's own notice stood on the page and the run waited on
 * purpose, for a time nobody was told (t378).
 */
function slowedDown(seconds: number | undefined, presses: boolean): Choice {
  const again = presses ? "pressing again" : "trying the step again";
  const wait = seconds === undefined ? "waiting a moment" : `waiting ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return { title: "Waiting: the site asked to slow down", text: `The site asked FluxIQ to slow down, so it is ${wait} before ${again}.` };
}

const SATISFIED: Choice = { title: "Moving on: the step's result is already there", text: "What this step was meant to do has already happened on the page, so FluxIQ carries on without repeating it." };

/**
 * The ladder's end, by why it pressed the step no more. Trying again is said
 * only of a step that was tried again, and no other end says it: lane A
 * round 5 (`run-muz0f12h-eae63685`, t366) read "The quick fixes didn't help:
 * Trying again didn't fix the step" for an Add to cart the page refused, which
 * nothing pressed a second time.
 * `{work}` is the run, or the test when a build runs its Flow to test it, and
 * `{then}` is what happens next (`THEN`).
 */
const NOT_TRIED_AGAIN = "Not repeating the step";
const STOPPED: Readonly<Record<"uncertain" | "tried_again" | "out_of_time" | "not_retryable" | "unknown", Choice>> = Object.freeze({
  uncertain: { title: NOT_TRIED_AGAIN, text: "FluxIQ can't tell whether the step went through, and repeating it could do it twice, so {then}." },
  tried_again: { title: "Trying again didn't help", text: "FluxIQ tried the step again and it still didn't work, so {then}." },
  out_of_time: { title: NOT_TRIED_AGAIN, text: "The {work} has already waited as long as it may, so {then}." },
  not_retryable: { title: NOT_TRIED_AGAIN, text: "Another try wouldn't change what happened, so {then}." },
  unknown: { title: NOT_TRIED_AGAIN, text: "The step didn't work, so {then}." }
});

/**
 * What happens once the ladder stops, as the run knows it when it says so
 * (`../../executor/step-loop/failed-attempt.ts`): the Flow's own way on from a
 * failure, a failed route or an On Fail handler in scope (`on_fail`); a way on
 * past a step the Flow can finish without (`goes_on`); an in-run fix of the
 * step (`repair`); or none of these, and the run ends here (`stop`). Paid run
 * R4a (t428) read "follows what the Flow says to do when this step fails" for
 * a step with no such path, and the test simply ended.
 */
export type AutomationStudioRecoveryNext = "on_fail" | "goes_on" | "repair" | "stop";
const THEN: Readonly<Record<AutomationStudioRecoveryNext, string>> = Object.freeze({
  on_fail: "{subject} follows what the Flow says to do when this step fails",
  goes_on: "{subject} carries on past this step, since the Flow can finish without it",
  repair: "FluxIQ will look at the page and fix this step before going on",
  stop: "{subject} stops here at this step"
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
 * build's test of its Flow. Without it, a stop says nothing of why. A retry
 * whose failure carries the site's own wait (`siteWaitMs`, from `retryAfterMs`
 * or a header) or a slow-down notice (`slowedDown`) says the site asked to slow
 * down and how long FluxIQ waits, "pressing again" for a step that presses
 * (`presses`). A stop says what happens next (`next`, `THEN`); without it,
 * the run is said to stop here, the one end that promises nothing.
 */
export function automationStudioActivityRecoveryChoice(
  outcome: { kind: string; rung?: string | undefined },
  run: { attempts?: number; actUncertain?: boolean; mayAbsorb?: boolean; retryable?: boolean; test?: boolean; siteWaitMs?: number | undefined; slowedDown?: boolean; presses?: boolean; next?: AutomationStudioRecoveryNext } = {}
): Choice {
  if (outcome.kind === "retry") {
    const waitMs = typeof run.siteWaitMs === "number" && Number.isFinite(run.siteWaitMs) && run.siteWaitMs > 0 ? run.siteWaitMs : undefined;
    if (waitMs !== undefined || run.slowedDown === true) return slowedDown(waitMs === undefined ? undefined : Math.max(1, Math.ceil(waitMs / 1000)), run.presses === true);
    return RETRY[outcome.rung ?? "retry_node"] ?? RETRY.retry_node!;
  }
  if (outcome.kind === "satisfied") return SATISFIED;
  const stop = run.actUncertain === true ? STOPPED.uncertain
    : (run.attempts ?? 1) > 1 ? STOPPED.tried_again
    : run.mayAbsorb === false ? STOPPED.out_of_time
    : run.retryable === false ? STOPPED.not_retryable
    : STOPPED.unknown;
  const work = run.test === true ? "test" : "run";
  // The run that already waited is "it" by then: "The run has already waited as long as it may, so it stops here".
  const subject = stop === STOPPED.out_of_time ? "it" : `the ${work}`;
  const then = THEN[run.next ?? "stop"].replace("{subject}", subject);
  return { title: stop.title, text: stop.text.replace("{then}", then).replace("{work}", work) };
}
