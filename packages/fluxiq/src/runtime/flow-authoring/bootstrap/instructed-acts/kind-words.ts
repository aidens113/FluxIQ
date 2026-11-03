import type { AutomationStudioInstructedAct } from "./contracts.ts";

/** The shared vocabulary for an act's kind, used by claim matching and advisory control feedback. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS: Readonly<Record<AutomationStudioInstructedAct["kind"], readonly string[]>> = Object.freeze({
  save: ["save", "saved", "bookmark"],
  add_to: ["add", "added", "put", "cart", "basket", "watchlist", "wishlist"],
  claim: ["coupon", "coupons", "voucher", "vouchers", "collect", "claim", "redeem"],
  set: ["switch", "set", "change", "filter", "sort", "narrow", "store", "radius", "location"],
  move: ["move", "moved"],
  open: ["open", "opened", "go", "view", "visit"],
  submit: ["book", "buy", "order", "reserve", "send", "post", "create", "confirm", "withdraw", "submit", "place", "check out", "checkout", "ask", "request", "apply", "quote", "bid"]
});

// What a step changed shows an act only in words that cannot describe anything
// else (W1, run `run-muqiho5c-e830ce01`: the add was named on "Not now", and
// only the press before it made the cart count rise). Two lists per kind,
// read against the host's `changed` lines (`../../flow-draft/step.ts`):
//
//   - PLACE words: where the act puts things, whose count rising is the act --
//     "Cart (3)" after "Cart (2)". A place, never the verb: "Add 2 to cart"
//     rising is the add's own button counting a quantity, and "Qty 2" names no
//     place at all, so neither shows that anything went in.
//   - DONE words: the past tense a page states once the act is done --
//     "Added to cart", "Coupon clipped", "Order placed" -- read on a line that
//     appeared or now reads so. Never a present verb, which a button still
//     offering the act carries ("Add to cart" reading where "Select a size"
//     did is a choice made, not an add).
//
// Kept apart from the kind words above, which say what a control names: a
// press of "Cart" names the place it visits; a count of it rising is evidence.
// Setting and opening have neither: their effect is the page itself.

/** Per kind, the places whose count rising shows the act was done (see above). */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_PLACE_WORDS: Readonly<Record<AutomationStudioInstructedAct["kind"], readonly string[]>> = Object.freeze({
  add_to: ["cart", "basket", "bag", "trolley", "watchlist", "wishlist"],
  save: ["saved", "bookmarks", "favourites", "favorites"],
  claim: ["coupons", "vouchers"],
  submit: ["orders"],
  move: [],
  set: [],
  open: []
});

/** Per kind, the words a page states once the act is done, on a line that appeared or now reads so (see above). */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_DONE_WORDS: Readonly<Record<AutomationStudioInstructedAct["kind"], readonly string[]>> = Object.freeze({
  add_to: ["added"],
  save: ["saved"],
  claim: ["collected", "claimed", "clipped", "redeemed", "applied"],
  submit: ["confirmed", "sent", "placed", "booked", "ordered", "submitted", "requested", "withdrawn", "posted", "published", "reserved", "purchased", "bought"],
  move: ["moved"],
  set: [],
  open: []
});

/**
 * Whether `text` holds `word` whole, case aside, with any run of spaces in the
 * word matching any run in the text: "cart" in "Add to cart", not "add" in
 * "Address". The one whole-word test a claim's control is read by
 * (`./claim-doubt.ts`, `./act-evidence.ts`).
 */
export function automationStudioInstructedActNamesWord(text: string, word: string): boolean {
  const escaped = word.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  return escaped !== "" && new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "iu").test(text);
}

/**
 * Whether `text` names `act`: its own verb, or a word of its kind
 * ("Add to basket" names an add, "Get coupons" a claim). The one test a
 * claim's control and an optional step's words are read by
 * (`./claim-doubt.ts`, `./optional-act-steps.ts`).
 */
export function automationStudioInstructedActWordsNameAct(act: Pick<AutomationStudioInstructedAct, "kind" | "verb">, text: string): boolean {
  return [act.verb, ...AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS[act.kind]].some((word) => automationStudioInstructedActNamesWord(text, word));
}

/**
 * Whether `text` states the act of `kind` done: a control that now reads
 * "Collected" or "Added" is evidence the act happened, never a control
 * unrelated to it (r4b F3: the claim's control read "Collected", which does not
 * name "collect" as a whole word, and the checklist doubted a done act).
 */
export function automationStudioInstructedActWordsShowDone(kind: AutomationStudioInstructedAct["kind"], text: string): boolean {
  return AUTOMATION_STUDIO_INSTRUCTED_ACT_DONE_WORDS[kind].some((word) => automationStudioInstructedActNamesWord(text, word));
}

/**
 * The kinds of act whose effect lasts after the step: setting and opening are
 * read from the page itself, and their controls name a value or a place.
 */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS: readonly AutomationStudioInstructedAct["kind"][] = Object.freeze(["save", "add_to", "claim", "submit", "move"] as const);

/**
 * A control's words that close or decline what they sit on, or answer a
 * cookie or privacy prompt: "Close the coupon offer", "No thanks", "Save
 * cookie preferences". Such words never do a person's act, whatever else they
 * name, so neither the optional-step rule nor a run's "not done" reads them as
 * one (`./optional-act-steps.ts`, `../../executor/step-skip/act-not-done.ts`).
 */
const DECLINES = /^(?:close|dismiss|hide|minimi[sz]e|skip|cancel|reject|decline|refuse|deny|later|maybe later|remind me later|not now|not interested|no,? thanks?|no thank you|continue without|continue shopping|continue browsing|go back|back)(?![a-z])|^[×✕✖╳xX]$/iu;
const PROMPT = /(?<![a-z])(?:cookies?|consent|privacy|tracking)(?![a-z])/iu;

/** Whether `text` closes, declines or answers a cookie or privacy prompt (see above). */
export function automationStudioInstructedActWordsDecline(text: string): boolean {
  const trimmed = text.trim();
  return DECLINES.test(trimmed) || PROMPT.test(trimmed);
}

/**
 * Whether a step's own words name a lasting act of any kind, without the
 * instruction to hand: what a run reads off a Flow node it passed over, which
 * carries no instruction (`../../executor/step-skip/act-not-done.ts`). Words
 * that decline (above) name none.
 */
export function automationStudioInstructedActWordsNameLastingAct(text: string): boolean {
  if (!text.trim() || automationStudioInstructedActWordsDecline(text)) return false;
  return AUTOMATION_STUDIO_INSTRUCTED_ACT_LASTING_KINDS.some((kind) => AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS[kind].some((word) => automationStudioInstructedActNamesWord(text, word)));
}
