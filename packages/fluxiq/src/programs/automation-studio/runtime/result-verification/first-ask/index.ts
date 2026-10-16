// Whether a confirming verification's yes was reached by its first ask and
// its confirmation, recorded where the calls are made (t677).
//
// **Why.** The playback hold (`../build-yes-hold/held-double-no.ts`) holds a
// double no to its build's yes only where that yes was the first call's and the
// second confirmed it (t296, t664). It used to tell that by counting the judge
// calls behind the yes, which counts every ask: a call asked again after a
// temporary fault, or after Core's exclusion-evidence recheck, made a genuinely
// confirmed yes look re-asked, and the hold passed it over. The count was a
// proxy for a fact only `../verify.ts` sees, so `../verify.ts` now states it
// (`firstAskConfirmed` on the outcome) and the build carries it to the hold.
//
// **The rule.** A yes is first-ask confirmed where all of this holds:
//
// - the verification confirms a first yes (`confirmAnswer`) and its outcome is
//   the model's yes;
// - each of the two checks ended on the model's yes;
// - no check's verdict changed between its asks (`./model-said.ts`);
// - no call was asked again with a recheck after the two checks: a refuted no
//   (t607), a contradicted unsure (t503), a split's no (t515) or a no blaming a
//   step that chose the request's words (t666). Each of these re-asks a call
//   that first said otherwise, which is exactly what makes a yes no first-ask
//   yes (t664's towels trial: two nos asked again).
//
// **What does not clear it, and why.** Inside one check (`askCheck`), a call is
// asked again for two reasons only. After a temporary fault, or a reply that
// could not be read, the earlier ask gave no verdict at all, so the later ask's
// answer is the check's first answer. After the exclusion-evidence recheck
// (`../exclusion-evidence/recheck.ts`), the earlier ask was itself the model's
// yes -- the recheck is asked only of a yes Core held for the quotes it lacked,
// and it asks to correct the explanation, not the verdict -- so a yes after it
// is the same verdict asked once more, not a different one turned. Either clears
// the flag only where the verdict word did change between the check's asks.
//
// A runtime result check (no `confirmAnswer`) never carries the flag: its yes
// is one call's and was never confirmed.

export * from "./confirmed.ts";
export * from "./model-said.ts";
