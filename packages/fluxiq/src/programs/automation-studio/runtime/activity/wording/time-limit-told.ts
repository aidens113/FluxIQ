// What a project build its time limit stopped says (t601, t608), in Core's
// words alone -- counts and verdicts, never a subflow's name or the model's
// reason: the limit, then what was tested of the latest plan's subflows, and
// what became of the whole Flow (`service/project-build/run.ts`).
//
// **A test the limit cut is said as cut (G2).** Social `run-mvfq957o-40103539`
// went back to a Flow it had tested whole several times, as a new revision, and
// the deadline cut that test off; the ending said the Flow was assembled and
// "never tested from its start". The whole Flow's last test is its latest
// finished test of the same Flow, and a later test the limit cut is said after
// it -- or, with none finished, that its test was cut short.

/** A whole or part test's verdict, as the trial gate answers it (`flow-bootstrap/candidate/`). */
type Verdict = "yes" | "no" | "unsure" | "not_judged" | "execution_failed";

/** One subflow's trials: how many ran, what the last answered, and whether any answered yes. */
export type AutomationStudioActivityTimeLimitTried = { count: number; last: Verdict; passed: boolean };

/** A test's last verdict, in words that finish "whose last test ...". */
const LAST_TRIAL_WORDS: Readonly<Record<Verdict, string>> = Object.freeze({
  yes: "passed",
  no: "was judged not to do what was asked",
  unsure: "could not be confirmed",
  not_judged: "could not be confirmed",
  execution_failed: "did not run to its end"
});

const KEPT = "it is kept as a draft, and nothing was put into the Flow.";

/**
 * The title and the account of what was tested (header). `subflows` are the
 * latest plan's subflows that carry parts; `assembled` is the whole Flow kept
 * as a draft, with its last finished whole test and whether a later one was
 * cut, absent when none was assembled.
 */
export function automationStudioActivityTimeLimitTold(input: {
  limitMs: number;
  subflows: readonly string[];
  trials: ReadonlyMap<string, AutomationStudioActivityTimeLimitTried>;
  assembled?: { tested: Verdict | undefined; cut?: boolean };
}): { title: string; tested: string } {
  const { subflows, trials, assembled } = input;
  const title = `The build reached its time limit of ${spoken(input.limitMs)} before a whole test of the Flow passed.`;
  const whole = wholeSaid(assembled);
  if (!subflows.length) return { title, tested: assembled ? whole : "No plan of its parts was written, so nothing was tested." };
  const passed = subflows.filter((key) => trials.get(key)?.passed === true).length;
  const opening = subflows.length === 1
    ? `Its one part ${passed ? "passed" : "did not pass"} its own test.`
    : passed === 0 ? `None of its ${subflows.length} parts passed its own test.` : `Of its ${subflows.length} parts, ${passed} passed ${passed === 1 ? "its" : "their"} own test.`;
  const left = subflows.filter((key) => trials.get(key)?.passed !== true).map((key) => {
    const tried = trials.get(key);
    if (!tried) return "a part never tested";
    return `a part tested ${tried.count === 1 ? "once" : `${tried.count} times`} whose last test ${LAST_TRIAL_WORDS[tried.last]}`;
  });
  const rest = left.length ? ` Left: ${joinedList(left)}.` : "";
  return { title, tested: `${opening}${rest} ${whole}` };
}

/** What became of the whole Flow: never assembled, or assembled and kept as a draft with its last finished whole test (t608), and a test the limit cut (header, G2). */
function wholeSaid(assembled: { tested: Verdict | undefined; cut?: boolean } | undefined): string {
  if (!assembled) return "The whole Flow was not assembled, so it was never tested as one.";
  if (assembled.tested === undefined) {
    return assembled.cut
      ? `A whole Flow was assembled, and its test from its start was cut short by the time limit before it finished; ${KEPT}`
      : `A whole Flow was assembled and never tested from its start; ${KEPT}`;
  }
  if (!assembled.cut) return `A whole Flow was assembled and tested from its start, and its last whole test ${LAST_TRIAL_WORDS[assembled.tested]}; ${KEPT}`;
  return `A whole Flow was assembled and tested from its start, and its last finished whole test ${LAST_TRIAL_WORDS[assembled.tested]}; a later test of it was cut short by the time limit. It ${KEPT.slice(3)}`;
}

function joinedList(items: readonly string[]): string {
  return items.length <= 1 ? items[0] ?? "" : `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}

/** A time limit in words: whole minutes where it is some, else seconds (as the supervisor's recorded ending says it). */
function spoken(ms: number): string {
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} minutes`;
  const seconds = Math.max(1, Math.round(ms / 1_000));
  return seconds === 1 ? "1 second" : `${seconds} seconds`;
}
