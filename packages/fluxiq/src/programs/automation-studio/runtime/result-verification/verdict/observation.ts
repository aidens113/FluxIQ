import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultReadSentence } from "../read-account/index.ts";

/**
 * Core's account of what the run produced, in one line.
 *
 * Counts and shape only. It is the observation behind every verdict, model or
 * not, so a person reading a failed run is told what was actually there rather
 * than only that something was judged wrong.
 */
export function automationStudioResultObservation(summary: AutomationStudioRunResultSummary): string {
  // A build's test stores nothing itself; what it is judged on is what the Flow
  // would store (`build-test/stores.ts`), and the check's card reads its count
  // off this head (`check-words.ts`). Run `run-muw60j7c-bb7c9a62` (C-3): the head
  // said "0 records stored" and the card "Passed: no rows came back" over a Flow
  // that would store 30 rows, 3 of them twice.
  const tested = summary.buildTest?.stores;
  const stored = tested ? wouldStore(tested) : `${summary.totalRecordCount} record${summary.totalRecordCount === 1 ? "" : "s"} stored`;
  const refused = summary.totalRefusedCount > 0 ? `, ${summary.totalRefusedCount} refused by record validation` : "";
  const sets = tested
    ? `, in ${tested.length} dataset${tested.length === 1 ? "" : "s"}`
    : `, across ${summary.recordSetCount} record set${summary.recordSetCount === 1 ? "" : "s"}${eachSet(summary)}`;
  // Every step, named: the observation reaches the repair, which is shown the
  // whole Flow.
  const listed = summary.flowShape.map((step) => step.definitionId);
  const shape = listed.length > 0 ? `; the Flow's steps were ${listed.join(", ")}` : "";
  const cut = summary.withheld ? "; some of it was withheld: a value secret-shaped or under a denied key, or a set the store reported truncated" : "";
  // How each read went, ahead of the step list: this line becomes the failure
  // record's `actual`, and a read's pages, stop and rejections are what a
  // repair acts on, where a definition id only says the step exists.
  const reads = (summary.reads ?? []).map((read) => `; ${automationStudioResultReadSentence(read, "brief")}`).join("");
  return `${stored}${refused}${sets}${reads}${shape}${cut}.`;
}

/**
 * Each record set's rows, when the run stored more than one and every one is
 * summarized: " (4, 4 rows)". The check's card says the answer's rows from it
 * (`check-words.ts`), never their sum: live run `run-mv5jnc5m-a47c3e59` (lane D
 * round 8) stored the 4 qualifying requests twice, once from the listing that
 * chose them and once from the read of the accepted ones, and the card said
 * "8 rows came back" of a 4-row answer.
 */
function eachSet(summary: AutomationStudioRunResultSummary): string {
  if (summary.recordSetCount < 2 || summary.recordSets.length !== summary.recordSetCount) return "";
  const distinct = distinctRows(summary);
  const same = distinct !== undefined && summary.recordSets.every((set) => set.recordCount === distinct);
  const told = distinct === undefined ? "" : same ? "; the same rows in each" : `; ${distinct} distinct`;
  return ` (${summary.recordSets.map((set) => set.recordCount).join(", ")} rows${told})`;
}

/**
 * How many distinct rows the record sets hold together, each row read by the
 * columns every set stores (t482): live run `run-mv636xyp-2e4fe54d`'s card
 * said "4 rows came back, in each of 2 record sets" of a listing and a read of
 * the same 4 requests. `undefined` where it cannot be told: no column every
 * set stores, a set whose rows were not all sent, or anything withheld.
 */
function distinctRows(summary: AutomationStudioRunResultSummary): number | undefined {
  if (summary.withheld) return undefined;
  const sets = summary.recordSets;
  if (sets.some((set) => set.truncated || set.columnsWithheld || (set.sampleRows?.length ?? 0) !== set.recordCount)) return undefined;
  const shared = sets[0]!.columns.filter((column) => sets.every((set) => set.columns.includes(column)));
  if (!shared.length) return undefined;
  const keys = new Set(sets.flatMap((set) => (set.sampleRows ?? []).map((row) => JSON.stringify(shared.map((column) => row[column] ?? null)))));
  return keys.size;
}

/** "30 records would be stored": every row of every dataset a build's Flow would write, which the card says as rows that would be stored. */
function wouldStore(stores: NonNullable<NonNullable<AutomationStudioRunResultSummary["buildTest"]>["stores"]>): string {
  const rows = stores.reduce((total, store) => total + store.answer.rows, 0);
  return `${rows} record${rows === 1 ? "" : "s"} would be stored`;
}
