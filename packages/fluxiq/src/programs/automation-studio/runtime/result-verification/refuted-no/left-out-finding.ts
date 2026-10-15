// Core's words for one row a condition alone left out and Core settled (t607,
// t629): what its read saw, and, where its condition tests the request's own
// words, those words and the value Core read. One sentence, said the same by
// every claim that refutes a no on that row (`./missing-claim.ts`,
// `./row-reference-claim.ts`, t631), so a reading refuted twice on one row
// carries the finding once.

import type { AutomationStudioResultNoLeftOutRow } from "./types.ts";

/** Core's finding for one settled left-out row (header). */
export function automationStudioResultLeftOutFinding(row: AutomationStudioResultNoLeftOutRow): string {
  if (!row.quoted) return `Core's read saw "${row.given}", and only ${row.condition} left it out: Core read that row's tested value itself, and it fails that condition as written.`;
  return `Core's read saw "${row.given}", and only ${row.condition} left it out: that condition tests the request's own words ${row.quoted.texts.map((text) => `"${text}"`).join(" or ")}, and Core read "${row.quoted.read}" on that row, which fails it as written.`;
}
