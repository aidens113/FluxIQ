// Core's latest readings of the pages the build acted on, in a person's words (t791).
//
// Crossborder `run-mvswhobv-5eb308c0` ended on the supervisor's unchecked claim, "the coupon was not collected and the
// cart holds one item", while Core's own last readings of those pages showed the coupon collected and four in the
// cart. The ending now says what Core last read -- the lines a page now shows that it did not show when the build
// began, and the ones it lost -- beside the build's acts (`activity/wording/left-told.ts`), so the person reads the
// site as Core saw it; a claim these readings contradict is left out of the reason (`./reason-contradicted.ts`).

import type { AutomationStudioProjectBuildReading } from "./reading.ts";

/** The most lines said per side, and the most of one line. */
const MAX_LINES = 4;
const MAX_LINE = 80;

/** `lines` as a quoted list, the first few, each cut where it is long. */
function quoted(lines: readonly string[]): string {
  const once = [...new Set(lines.map((line) => line.replace(/\s+/gu, " ").trim()).filter((line) => line))];
  const named = once.slice(0, MAX_LINES).map((line) => `“${line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1).trimEnd()}…` : line}”`);
  const more = once.length - named.length;
  return `${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

/**
 * Core's last readings as one sentence (header), or undefined when no reading shows a difference from how the build
 * found the pages.
 */
export function automationStudioProjectBuildReadingsTold(readings: readonly AutomationStudioProjectBuildReading[]): string | undefined {
  const added = readings.flatMap((reading) => reading.added);
  const gone = readings.flatMap((reading) => reading.gone);
  const parts = [added.length ? `now shows ${quoted(added)}` : "", gone.length ? `no longer shows ${quoted(gone)}` : ""].filter((part) => part);
  return parts.length ? `Where the build acted, Core last read the page${readings.length > 1 ? "s" : ""} as it ${parts.join(" and ")}.` : undefined;
}
