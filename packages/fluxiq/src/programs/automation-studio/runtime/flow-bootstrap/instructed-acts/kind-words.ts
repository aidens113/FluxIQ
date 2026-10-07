import type { AutomationStudioInstructedAct } from "./contracts.ts";

/** The shared vocabulary for an act's kind, used by claim matching and advisory control feedback. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS: Readonly<Record<AutomationStudioInstructedAct["kind"], readonly string[]>> = Object.freeze({
  save: ["save", "saved", "bookmark"],
  add_to: ["add", "added", "put", "cart", "basket", "watchlist", "wishlist"],
  claim: ["coupon", "coupons", "voucher", "vouchers", "collect", "claim", "redeem"],
  set: ["switch", "set", "change", "filter", "sort", "narrow", "store", "radius", "location"],
  move: ["move", "moved"],
  open: ["open", "opened", "go", "view", "visit"],
  submit: ["book", "buy", "order", "send", "post", "create", "confirm", "withdraw", "submit", "place", "check out", "checkout", "ask", "request", "apply", "quote", "bid"]
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
