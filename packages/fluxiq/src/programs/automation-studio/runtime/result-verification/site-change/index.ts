// A build's trial judged by its change (t775): how the judged summary's
// `siteChange` -- what Core read at each place a lasting step's change shows,
// just before the trial and just after it (`../../flow-bootstrap/trial-change/`)
// -- is sent, and how the agreement holds the judges to it.
//
// The rule (user, 2026-10-27): a trial is judged against the site's state just
// before it and the change the task asks for. A list line at 9 that is 10
// after a part asking to add 1 is met, with no reset; an end state that held
// before the trial proves nothing unless this build was seen making it.
//
// - `screened.ts`: the packet and Core's findings over it made sendable. Every
//   key is Core's own, so its text alone is screened, each credential-shaped
//   string said as withheld.
// - `held.ts`: a yes is not taken where `siteChange` proves a part with a typed
//   effect only as `no_change`, `already_in_end_state` or `unproven`. The
//   outcome is unsure and unconfirmed, the reason naming each part and its
//   proof: never a yes, and never a no Core made (`../agreement/`,
//   `verification-agreement.ts`).
// - `count-claim.ts`: a no's sentence that states an absolute count of what a
//   change part asks for, where every place the part's change shows changed by
//   exactly the count it asks, is refuted with Core's change line, and the no
//   whose every reason is refuted is asked once more as any other
//   (`../refuted-no/weigh.ts`, `../refuted-no/reask.ts`). Closed form: a count
//   is a numeral followed within two words by a word of the part's `what`, not
//   a step's, pass's, row's or page's number; a sentence with any clause about
//   something else is left to the other claims; a row value moved by some
//   units (a list witness's `changed`) is never matched, since Core does not
//   parse page quantities.
//
// Its own directory, beside `../agreement/` and `../refuted-no/`, because both
// are at the directory budget; neither is imported from here.

export { automationStudioResultChangeCountClaim } from "./count-claim.ts";
export { automationStudioResultSiteChangeHeld } from "./held.ts";
export { automationStudioResultSiteChangeScreened } from "./screened.ts";
