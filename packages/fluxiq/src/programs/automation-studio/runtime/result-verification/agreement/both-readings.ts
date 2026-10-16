import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioResultVerification } from "../contracts/index.ts";
import type { AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import { CONTRADICTED, CONTRADICTED_ORDER, PART_CONTRADICTED } from "./contradicted-labels.ts";
import { contradictsOrderRecord, contradictsPagingRecord } from "./record-contradictions.ts";
import type { JudgeReading } from "./types.ts";

/** One call's reading as the repair is told it, and, where Core's record contradicts it, what the reading says of itself. */
type Weighed = { call: 1 | 2; verification: AutomationStudioResultVerification; reading: JudgeReading; contradicted: boolean; because?: string };

/**
 * The refutation two calls that both said no come to (t501, D1).
 *
 * Where only one call gave a reading, or both gave the same, and the record
 * contradicts neither, the first call's directive stands exactly as before.
 * Otherwise the judgement carries every reading, each field's parts labelled
 * "Judge call N" (a field both worded alike is said once, unlabelled), the one
 * the record does not contradict first, and a reading the record contradicts
 * says so in its label: a judge said there are more
 * pages where every paging read's own account says its list ended
 * (`contradictsPagingRecord`). Nothing is spliced: each part is one call's own
 * words under its own label. The findings are Core's and identical by
 * construction; `checked` lines are Core's checks of the rows each reading
 * names, so both calls' are kept. The failure record is the leading call's.
 */
export function bothReadings(
  first: AutomationStudioResultVerification,
  second: AutomationStudioResultVerification,
  reads: readonly AutomationStudioResultReadAccount[] | undefined,
  recordSets: readonly AutomationStudioResultRecordSetSummary[] | undefined,
  /** What Core's record says of each call's no where it refutes any of it (t607, `../refuted-no/`; in part, t641). */
  refuted: ReadonlyMap<1 | 2, AutomationStudioResultNoWeighed> = new Map()
): AutomationStudioResultVerification {
  const weighed: Weighed[] = [];
  for (const [call, verification] of [[1, first], [2, second]] as const) {
    const reading = verification.repair?.judgement;
    if (!reading || !(reading.expected || reading.observed || reading.advice)) continue;
    if (weighed.some((other) => sameWords(other.reading, reading))) continue;
    const found = refuted.get(call);
    const because = contradictsPagingRecord(reading, reads) ? CONTRADICTED : contradictsOrderRecord(reading, recordSets) ? CONTRADICTED_ORDER
      : found?.wholly ? `contradicted by Core's record: ${found.findings.join(" ")}` : undefined;
    // A reading the record refutes only in part still stands, and says which part (header, t641).
    const label = because ?? (found?.findings.length ? `${PART_CONTRADICTED}: ${found.findings.join(" ")}` : undefined);
    weighed.push({ call, verification, reading, contradicted: because !== undefined, ...(label ? { because: label } : {}) });
  }
  if (!weighed.some((one) => one.because) && weighed.length < 2) return weighed[0]?.verification ?? first;
  const ordered = [...weighed.filter((one) => !one.contradicted), ...weighed.filter((one) => one.contradicted)];
  const lead = ordered[0]!.verification;
  const labelled = (field: "expected" | "observed" | "advice"): string | undefined => {
    const saying = ordered.filter((one) => one.reading[field]);
    // A field both calls worded alike is said once, unlabelled.
    if (saying.length > 1 && saying.every((one) => one.reading[field] === saying[0]!.reading[field])) return saying[0]!.reading[field];
    const parts = saying.map((one) => `Judge call ${one.call}${one.because ? ` (${one.because})` : ""}: ${one.reading[field]}`);
    return parts.length ? parts.join(" ") : undefined;
  };
  const expected = labelled("expected");
  const observed = labelled("observed");
  const advice = labelled("advice");
  const stillAchievable = weighedStillAchievable(ordered);
  const checked = [...new Set([lead, first, second].flatMap((verification) => verification.repair?.checked ?? []))];
  const withheld = first.repair?.withheld === true || second.repair?.withheld === true;
  const repair = lead.repair ?? first.repair!;
  return {
    ...lead,
    repair: {
      ...repair,
      judgement: { ...(expected ? { expected } : {}), ...(observed ? { observed } : {}), ...(advice ? { advice } : {}), ...(stillAchievable ? { stillAchievable } : {}) },
      ...(checked.length ? { checked } : {}),
      ...(withheld ? { withheld: true } : {})
    }
  };
}

/** Whether two readings say the same words in every field. */
function sameWords(one: JudgeReading, other: JudgeReading): boolean {
  return one.expected === other.expected && one.observed === other.observed && one.advice === other.advice;
}

/**
 * Whether what was asked can still be had, by the readings the record does
 * not contradict (all of them where it contradicts every one): their word where
 * they agree, and otherwise the first that is not `no`, since a build ends
 * "not doable" only on `no` (t195-w37) and one reading saying it can be had is
 * reason enough not to.
 */
function weighedStillAchievable(ordered: readonly Weighed[]): JudgeReading["stillAchievable"] {
  const standing = ordered.some((one) => !one.contradicted) ? ordered.filter((one) => !one.contradicted) : ordered;
  const words = standing.map((one) => one.reading.stillAchievable).filter((word) => word !== undefined);
  if (!words.length) return undefined;
  return words.every((word) => word === words[0]) ? words[0] : words.find((word) => word !== "no");
}
