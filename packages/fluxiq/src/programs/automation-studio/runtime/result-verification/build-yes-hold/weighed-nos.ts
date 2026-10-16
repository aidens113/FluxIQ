// What Core's record says of each call's no on a double no (t664): what the
// hold (`./held-double-no.ts`) needs before it may set a no aside.
//
// **Why.** A8 frozen pair 7 candidate towels `run-mvahlxuu-760d9e28`: the
// build's trial was a yes on the rows it stored, but its yes never looked at the
// one kept row that was not the item asked for; the playback's two nos named
// that row, correctly, and Core's record contradicted no part of either. Had the
// hold fired it would have buried two right nos for a wrong yes. So a no is set
// aside only where Core's record contradicts at least part of its reading
// (`recordContradicts`, the fact t641 and t652 put beside each label), and a no
// that stands whole is never set aside.
//
// **Where the weighing comes from.** `../agreement/` weighs each call's no on
// a double no and records it as the outcome's `weighedNos` field (t663,
// `../contracts/verification.ts`), recomputed after a re-ask: one entry per
// call, `recordContradicts` set where Core's record refutes any of that call's
// reading. A gate reads the fact, never the labels' words (t641). The agreement
// writes it only where it holds Core's record of the result; an outcome
// without it, or with a malformed one, reads as unweighed, and an unweighed no
// is never set aside.

import type { AutomationStudioResultVerification } from "../contracts/index.ts";

/** One call's no as Core's record weighed it: `recordContradicts` where the record refutes any of its reading, absent where all of it stands. */
export type AutomationStudioResultWeighedNo = { call: 1 | 2; recordContradicts?: "whole" | "part" | undefined };

/** The double no's weighing of each call's no (header), read strictly; nothing where the outcome carries none or a malformed one. */
export function automationStudioResultWeighedNos(outcome: AutomationStudioResultVerification): AutomationStudioResultWeighedNo[] | undefined {
  // Read as unknown and checked entry by entry: an outcome may come back from storage, and a malformed one holds nothing.
  const stored: unknown = outcome.weighedNos;
  if (!Array.isArray(stored) || !stored.length) return undefined;
  const read: AutomationStudioResultWeighedNo[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const { call, recordContradicts } = entry as { call?: unknown; recordContradicts?: unknown };
    if (call !== 1 && call !== 2) return undefined;
    if (recordContradicts !== undefined && recordContradicts !== "whole" && recordContradicts !== "part") return undefined;
    read.push({ call, ...(recordContradicts ? { recordContradicts } : {}) });
  }
  return read;
}

/** Whether Core's record contradicts at least part of the no of both calls: the only double no the hold may set aside. */
export function automationStudioResultEveryNoContradicted(weighed: readonly AutomationStudioResultWeighedNo[]): boolean {
  return ([1, 2] as const).every((call) => weighed.some((no) => no.call === call && no.recordContradicts !== undefined));
}
