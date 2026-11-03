// A sentence of a no weighed on the rows it names, whatever its wording (t631).
//
// **Why.** A8 bigbox `run-mv9gbsm5-2957581c` step 0109: "Condition 2 ...
// dropped rows whose pickup value was "Pickup tomorrow" (<five rows>) ..., which
// the request does not exclude." Every row it named was one a condition testing
// the request's own words alone left out, on a value Core read failing them --
// the claim t629 refutes -- but no pattern of `./missing-claim.ts` matched the
// sentence, and it stood. A wording list keeps missing the next phrasing; the
// rows a sentence names (`./named-rows.ts`: Core's row ids, `[row XXXXXX]`, or a
// stored or left-out row's own label) do not depend on it.
//
// **The rule.** Whatever the sentence says of them:
//
// - Every row it names is one a condition alone left out, Core settled, and the
//   condition tests the request's own words (`./record.ts`, `quotesRequest`):
//   refuted. The row is not in the result, and by the value Core read it is
//   not what the request asks for, so neither "missing" nor "wrongly kept"
//   holds of it.
// - It names a left-out row Core did not settle: the claim stands. Whether the
//   request asks for that row is the judge's to weigh.
// - It says the rows it names are in the result ("stored 9 rows including",
//   "the result includes"), and nowhere that rows are out of it, and every one
//   is a row a condition alone left out: refuted, the row is not in the result.
// - Otherwise -- a stored row, a row settled by a bound Core does not hold to
//   the request, a row Core has no record of -- the rows alone do not settle
//   the claim, and the sentence is read by its words as before (t607, t629).

import { automationStudioResultLeftOutFinding } from "./left-out-finding.ts";
import type { AutomationStudioResultNoClaim, AutomationStudioResultNoLeftOutRow, AutomationStudioResultNoNamedRows } from "./types.ts";

/** The nouns a judge calls the result's rows by. Generic, never any site's. */
const ROWS = String.raw`(?:rows?|records?|items?|entries|listings?|products?|results?)`;
/** Words that say named rows are in the result, never "should be kept" or "not stored". */
const KEPT = new RegExp([
  String.raw`\b(?:stored|kept|returned|saved)\s+(?:\d+\s+)?(?:[\p{L}-]+\s+)?${ROWS}\s+(?:including|such\s+as|like)\b`,
  String.raw`\b(?:result|answer|output|stored\s+rows)\s+(?:also\s+)?(?:includes?|contains?|holds?)\b`
].join("|"), "iu");
/** Words that say rows are out of the result: a sentence saying both is not read as calling its rows kept. */
const OUT = /\b(?:missing|absent|dropp(?:ed|ing)|left\s+out|leaves?\s+out|exclud(?:ed|es|ing)|omit(?:s|ted|ting)?|filter(?:ed|s)?\s+out|reject(?:ed|s)|remov(?:ed|es))\b/iu;

/** The claim a sentence makes about the rows it names, weighed on those rows (header); nothing where the rows alone do not settle it. */
export function automationStudioResultRowReferenceClaim(sentence: string, named: AutomationStudioResultNoNamedRows): AutomationStudioResultNoClaim | undefined {
  if (named.unmatched || named.stored.length || !named.leftOut.length) return undefined;
  const rows = byLabel(named.leftOut);
  if (KEPT.test(sentence) && !OUT.test(sentence)) return { refuted: true, finding: rows.map((same) => `"${same[0]!.label}" is not in the stored rows: only ${same.map((row) => row.condition).join(" or ")} left it out.`).join(" ") };
  if (rows.some((same) => same.some((row) => !row.settled))) return { refuted: false };
  if (!rows.every((same) => same.every((row) => row.quotesRequest))) return undefined;
  return { refuted: true, finding: rows.flat().map(automationStudioResultLeftOutFinding).join(" ") };
}

/** The named rows, grouped by label in the order first named. */
function byLabel(rows: readonly AutomationStudioResultNoLeftOutRow[]): AutomationStudioResultNoLeftOutRow[][] {
  const groups = new Map<string, AutomationStudioResultNoLeftOutRow[]>();
  for (const row of rows) groups.set(row.label, [...(groups.get(row.label) ?? []), row]);
  return [...groups.values()];
}
