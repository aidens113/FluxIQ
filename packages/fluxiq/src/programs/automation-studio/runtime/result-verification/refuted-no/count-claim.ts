// A no's claim about how many rows the result holds (t607).
//
// Core knows how many rows the result stores. A sentence naming no row that
// says "only N rows" or "N rows were stored" is refuted where Core stored a
// different number; one that states Core's own count makes no claim against
// the result. A count said of named rows ("the 2 rows stored twice") is not a
// count of the result, and is left to the other claims.

import type { AutomationStudioResultNoClaim, AutomationStudioResultNoNamedRows, AutomationStudioResultNoRecord } from "./types.ts";

/** A stated total: "only 10 rows", "just 3 records", "10 rows were stored", "stored 10 rows". */
const STATED_COUNT = /\b(?:only|just)\s+(\d+)\s+(?:rows?|records?|items?|results?|entries)\b|\b(\d+)\s+(?:rows?|records?)\s+(?:were|was|are|is)\s+(?:stored|returned|kept|saved)\b(?!\s+(?:twice|again))|\b(?:stored|returned|saved)\s+(?:only\s+)?(\d+)\s+(?:rows?|records?)\b/iu;

/** The claim a sentence makes about the result's count (header); nothing where it states none, or states Core's own. */
export function automationStudioResultCountClaim(sentence: string, named: AutomationStudioResultNoNamedRows, record: AutomationStudioResultNoRecord): AutomationStudioResultNoClaim | undefined {
  if (named.stored.length || named.leftOut.length) return undefined;
  const match = STATED_COUNT.exec(sentence);
  if (!match) return undefined;
  const stated = Number(match[1] ?? match[2] ?? match[3]);
  if (!Number.isFinite(stated) || stated === record.storedCount) return undefined;
  return { refuted: true, finding: `Core's record holds ${record.storedCount} stored row${record.storedCount === 1 ? "" : "s"}, not ${stated}.` };
}
