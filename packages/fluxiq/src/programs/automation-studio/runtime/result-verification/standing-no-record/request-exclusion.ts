// Whether a condition leaves rows out by what the request itself says to leave
// out, as Core's record of the judged result measured it (t687).
//
// **Why.** A8 cost round `run-mvblov2i-abb7d82e`: a request said to leave out
// a kind of listing, and a read's presence condition left out every row the
// page marked so. One judge advised dropping it, its reading labelled wholly
// contradicted by Core's record; the builder dropped it anyway, and the next
// revision stored rows the request excludes. Core keeps a condition across a
// build's trials only where its record accounts for every row it left out
// (`keptOut`, t641) -- a rule about what a condition takes away, which says
// nothing where Core cannot account for a row (one sent without a label, one
// whose value it did not read). A condition written in the request's own
// exclusion words needs no such account: the request asks for it.
//
// **What counts, from Core's record alone.** The condition as its account
// words it is one that leaves rows out for having something -- a presence test
// keeping the rows that lack a value (`<subject> is absent`, `<subject> not is
// present`) or a negated text test (`<subject> not contains "..."`) -- the
// shapes `../refuted-no/request-text-test.ts` reads by the request's exclusion
// words (`../refuted-no/request-exclusion-test.ts`, t660). Of the rows it alone
// left out, Core settled some, reading the value on each: where that test
// passed on the value (`quoted`, `../refuted-no/record.ts`), the row has what
// the request says to leave out. So:
//
// - `excludes`: the request's words, where at least one such row passed and
//   none failed;
// - `askedFor`: each settled row that failed it, on which Core read a value
//   (its witness, not empty), with no other copy in the result -- Core read a
//   value on it the request does not say to leave out, so by Core's own
//   reading it is a row the request asks for. A row whose value Core did not
//   read says nothing either way.
//
// Only over a read that kept rows, with the request given: the test runs
// nowhere else, so a row's failing it says nothing there. Never a condition
// testing a row's own label (t651), whose rows are never quoted.

import type { AutomationStudioResultReadAccount, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioResultNoCondition, AutomationStudioResultNoRecord } from "../refuted-no/index.ts";
import { automationStudioRequestRowLabel } from "../request-rows/index.ts";

/** A presence test that keeps the rows lacking a value, as its account words it (`../refuted-no/request-exclusion-test.ts`). */
const LACKING = /^(?:.+?) (?:is absent|not is present)(?: \(a row is kept only when it has no .*\))?$/su;
/** A negated literal text test of quoted text, as its account words it (`../refuted-no/request-exclusion-test.ts`). */
const NEGATED_TEXT = /^(?:.+?) not (?:contains|equals|startsWith|endsWith) (?:\[|")/su;

/** What Core's record says of `condition` as an exclusion the request states (header); nothing where it says nothing. */
export function automationStudioResultConditionRequestExclusion(
  condition: AutomationStudioResultNoCondition,
  record: AutomationStudioResultNoRecord,
  summary: AutomationStudioRunResultSummary
): { excludes?: string[]; askedFor?: string[] } {
  const wording = condition.wording;
  if (!wording || !record.says || !(LACKING.test(wording) || NEGATED_TEXT.test(wording))) return {};
  const read = (summary.reads ?? []).find((account) => account.nodeId === condition.nodeId && account.kept > 0);
  if (!read) return {};
  const stored = new Set(record.stored.map((row) => row.label));
  const settled = record.leftOut.filter((row) => row.condition === condition.name && row.settled && !row.testsLabel);
  const valued = readValues(read, condition.number);
  const askedFor = [...new Set(settled.filter((row) => !row.quotesRequest && !stored.has(row.label) && valued.has(row.label)).map((row) => row.label))];
  if (askedFor.length) return { askedFor };
  const excludes = [...new Set(settled.flatMap((row) => row.quoted?.texts ?? []))];
  return excludes.length ? { excludes } : {};
}

/** The labels of the rows condition `number` of `read` alone left out on which Core read a value, not empty (header): only such a row's value can fail the request's words. */
function readValues(read: AutomationStudioResultReadAccount, number: number): Set<string> {
  const counted = (read.conditions ?? []).find((one, index) => (one.number ?? index + 1) === number);
  const labels = new Set<string>();
  (counted?.leftOutOnlyByThis ?? []).forEach((row, at) => {
    const witness = counted?.leftOutObservations?.[at];
    if (witness?.state === "present" && witness.value.trim()) labels.add(automationStudioRequestRowLabel(row));
  });
  return labels;
}
