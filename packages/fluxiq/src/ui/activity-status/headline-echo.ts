// Whether a detail line only says the headline again (U2 of the t174 live
// lane's UI review: "Run finished" under "Run finished", "Building the Flow"
// under "Building your Flow"). A line that repeats the one above it costs the
// person a read and tells them nothing, so the pacer drops it and the overlay
// never draws one.
//
// Two lines echo when, compared without case, punctuation or the small words
// ("your", "the", "a"), they are the same, or the detail is only part of the
// headline ("Waiting for you" under "Waiting for you: finish the check on the
// page"). A detail that adds something ("Build failed: no list was found") is
// not an echo, but it does not open by saying the headline again either: the
// status read "Build failed | Build failed: FluxIQ could not finish the Flow"
// (t753), so a detail that opens with the headline and a colon or dash keeps
// only what follows ("No list was found").

const FILLER = /\b(?:your|the|a|an)\b/gu;
/** The small words a detail may put before or between the headline's own. */
const FILLER_WORDS = "(?:your|the|a|an)";
const NOT_WORD = "[^\\p{L}\\p{N}]+";

/** True when `detail` says nothing `headline` does not already say. */
export function isHeadlineEcho(headline: string, detail: string | null | undefined): boolean {
  if (typeof detail !== "string") return false;
  const said = normalised(detail);
  if (!said) return false;
  const heading = normalised(headline);
  return said === heading || ` ${heading} `.includes(` ${said} `);
}

/**
 * `detail` as it is shown under `headline`: null when it only echoes it, else
 * without an opening that says the headline again ("Build failed: no list was
 * found" under "Build failed" is "No list was found").
 */
export function activityWithoutHeadline(headline: string, detail: string | null): string | null {
  if (detail === null || isHeadlineEcho(headline, detail)) return null;
  const words = normalised(headline).split(" ").filter(Boolean).map(escaped);
  if (!words.length) return detail;
  const opening = new RegExp(`^[^\\p{L}\\p{N}]*(?:${FILLER_WORDS}${NOT_WORD})*${words.join(`${NOT_WORD}(?:${FILLER_WORDS}${NOT_WORD})*`)}\\s*[:—–-]\\s*`, "iu");
  const rest = detail.replace(opening, "");
  if (rest === detail || !rest.trim()) return detail;
  return `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}

function normalised(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(FILLER, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
