// Whether a detail line only says the headline again (U2 of the t174 live
// lane's UI review: "Run finished" under "Run finished", "Building the Flow"
// under "Building your Flow"). A line that repeats the one above it costs the
// person a read and tells them nothing, so the pacer drops it and the overlay
// never draws one.
//
// Two lines echo when, compared without case, punctuation or the small words
// ("your", "the", "a"), they are the same, or the detail is only the start of
// the headline ("Waiting for you" under "Waiting for you: finish the check on
// the page"). A detail that adds something ("Build failed: no list was found")
// is not an echo.

const FILLER = /\b(?:your|the|a|an)\b/gu;

/** True when `detail` says nothing `headline` does not already say. */
export function isHeadlineEcho(headline: string, detail: string | null | undefined): boolean {
  if (typeof detail !== "string") return false;
  const said = normalised(detail);
  if (!said) return false;
  const heading = normalised(headline);
  return said === heading || heading.startsWith(`${said} `);
}

function normalised(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(FILLER, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
