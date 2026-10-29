// The supervisor's reason without a claim of the site's state that Core's latest readings contradict (t791).
//
// A sentence that says what the site holds or lacks after the build's acts -- "the coupon was not collected", "the cart
// holds one item" -- is the model's unchecked claim. Where Core has read the page it is about
// (`./readings-told.ts`) and the sentence shares a word with what that page now shows or lost, the readings are said
// instead and the claim gives way. A sentence that claims no state of the site, or shares no word with a reading, stays.

import type { AutomationStudioProjectBuildReading } from "./reading.ts";

/** Words that make a sentence a claim of how the site stands: a lack, an amount, or what it holds. */
const STATE_CLAIM = /\b(?:not|never|no|none|nothing|neither|nor|only|just|still|empty|holds?|held|contains?|contained|has|have|had|\d+|one|two|three|zero|single)\b/iu;
/** Words too common to show a sentence is about the same thing as a line. */
const COMMON = new Set(["that", "this", "with", "from", "they", "were", "have", "been", "there", "their", "which", "would", "could", "about", "after", "before", "because", "since", "still", "holds", "only", "just", "page", "site", "item", "items", "build", "flow", "step", "steps"]);

/** The stems (five letters) of a text's words of four letters or more, without common words. */
function stems(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter((word) => !COMMON.has(word)).map((word) => word.slice(0, 5)));
}

/** `reason` without each sentence that claims the site's state and is about what a reading shows or lost (header). */
export function automationStudioProjectBuildReasonContradicted(reason: string, readings: readonly AutomationStudioProjectBuildReading[]): string {
  const seen = stems(readings.flatMap((reading) => [...reading.added, ...reading.gone]).join(" "));
  if (!seen.size) return reason;
  const pieces = reason.split(/(?<=[.!?;])\s+/u).map((piece) => piece.trim()).filter((piece) => piece);
  return pieces.filter((piece) => !(STATE_CLAIM.test(piece) && [...stems(piece)].some((stem) => seen.has(stem)))).join(" ");
}
