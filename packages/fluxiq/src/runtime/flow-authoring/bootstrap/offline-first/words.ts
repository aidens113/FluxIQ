// The plain sentences a model reads about an offline-first test (trace plan
// P6, t769): the kept answer's instruction prefix and each live note's
// sentence. Generic words only (D36; "model guidance never teaches to the
// test"): never an id, a run, a trace, a page's content, or a realistic
// site's or task's words. The gap reasons are keyed by the matcher's plain
// code strings, repeated here, so nothing is imported from the trace code
// (`client-gateway/trace-matcher/gap-reasons.ts` lists them; the service that
// maps a gap checks every one has words here).

const RECORDING = "the recording of this build's last live test";
const ON_SITE = "this test ran on the site, and the verdict here is the site's.";

/** Why the recording could not answer a step, by the matcher's gap reason code; each fits "(...)" after "could not answer step N". */
const REASONS: Readonly<Record<string, string>> = Object.freeze({
  missing_transition: "a step was added there, or the steps before it changed",
  argument_mismatch: "its action changed: another target or other values",
  ambiguous_context: "the order of the steps changed",
  missing_artifact: "the recording is missing what that step needs",
  incomplete_capture: "the recording is incomplete there",
  incompatible_contract: "the recording was made in a form this test cannot read",
  redacted_input: "the recording withheld what that step is compared with",
  snapshot_unavailable: "the recording kept no saved copy of the page at that point",
  dynamic_content: "the page changed by itself there, which a saved copy of it cannot show"
});

const OTHER_REASON = "the recording holds no answer for it";

export const AUTOMATION_STUDIO_TRIAL_OFFLINE_FIRST_WORDS = Object.freeze({
  /** Put before a kept answer's instruction: the failure was shown on the recording and nothing was done on the site. */
  kept: "This test ran against the recording of this build's last live test, not the site. Nothing was done on the site for it; the feedback is what this revision did against that recording.",
  /** A live note: the revision passed against the recording, then ran on the site. */
  passed: `This revision passed against ${RECORDING}; then ${ON_SITE}`,
  /** A live note: the recording settled nothing. */
  inconclusive: `Testing against ${RECORDING} settled nothing, so ${ON_SITE}`,
  /** A live note: no recording could stand in for this test. */
  notTried: `No recording of an earlier live test could stand in for this one, so ${ON_SITE}`,
  /** Each gap reason's words, by its plain code. */
  reasons: REASONS,
  /** The words of a reason not in `reasons`. */
  otherReason: OTHER_REASON,
  /** A live note over a gap: the step the recording could not answer, and why in words, never the code. */
  gap(step: number, why: string): string {
    const reason = Object.hasOwn(REASONS, why) ? REASONS[why]! : OTHER_REASON;
    return `The recording of this build's last live test could not answer step ${step} (${reason}), so ${ON_SITE}`;
  }
});
