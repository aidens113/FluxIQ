// How many rows an attempt left out because the act record held them done (t870): what a person's
// card says, beside what a forward run tells the model only by count.
//
// **What counts.** A pass of a list over a row (a forward run's, a real run's), or a refused press
// (`./record.ts`). A saved step with no row of its own counts the row its act was on. A model that keeps
// away from a done row by itself left nothing out as far as anything can know, so it does not count. A
// row pressed in the end, after a look, was not left out after all.
//
// **Two rows a read returned value for value** are one identity and two rows. A forward run passes over
// each, so each counts, once however many times a run goes over the list; a press names one, and it is
// one. A real run shows the record no read, so it can only say such rows as one.
//
// In memory, as it says what this attempt did, and only ever read as a number.

import type { AutomationStudioAttemptActRowTies } from "./row-ties.ts";

export class AutomationStudioAttemptActRowsLeftOut {
  /** Rows left out, and how many of each. */
  private readonly held = new Map<string, number>();
  /** How many rows one read returned value for value, where that is more than one. */
  private readonly copies = new Map<string, number>();

  /** The rows of one read's list, by identity, to know two rows that are alike from one row said twice. */
  noteList(identities: readonly string[]): void {
    const seen = new Map<string, number>();
    for (const identity of identities) seen.set(identity, (seen.get(identity) ?? 0) + 1);
    for (const [identity, times] of seen) if (times > (this.copies.get(identity) ?? 1)) this.copies.set(identity, times);
  }

  /** Whether a read returned this identity as several rows. */
  isSeveral(row: string): boolean {
    return this.copies.has(row);
  }

  /** A refused call left these out: rows that fit it together are one row left out. */
  refused(rows: readonly string[]): void {
    const [first] = rows;
    if (first === undefined || rows.some((row) => this.held.has(row))) return;
    this.held.set(first, 1);
  }

  /** A pass of a list left this row out. */
  passedOver(row: string): void {
    this.held.set(row, Math.min((this.held.get(row) ?? 0) + 1, this.copies.get(row) ?? 1));
  }

  /** An act ran on these rows: where that is one row, in however many shapes, it was not left out, whatever a refusal before a look counted. */
  ranOn(rows: readonly string[], ties: AutomationStudioAttemptActRowTies): void {
    if (this.held.size === 0 || rows.length === 0 || ties.distinct(new Set(rows)) !== 1) return;
    for (const row of rows) this.held.delete(row);
  }

  /** How many rows these are, one row in several shapes counted once and each copy a read returned on its own. */
  count(ties: AutomationStudioAttemptActRowTies): number {
    return ties.distinct(new Set(this.held.keys())) + [...this.held.values()].reduce((more, copies) => more + copies - 1, 0);
  }
}
