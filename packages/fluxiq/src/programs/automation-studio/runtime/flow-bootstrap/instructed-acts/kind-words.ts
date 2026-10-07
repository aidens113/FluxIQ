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
