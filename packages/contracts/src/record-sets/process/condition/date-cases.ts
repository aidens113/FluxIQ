// The parity table for date conditions (t800, K1). A date condition must keep
// the same rows wherever it is judged: Core's run-end processing
// (`parse-condition.ts`, then `condition/holds.ts`), and a downstream domain's
// own reading of how a model writes one and its page-side filter. Core's tests
// run every case through Core's parser and judge; a domain imports this
// constant and runs it through its grammar and its filter, at the case's `now`.
//
// `written` is the condition as a Flow writes it, less the field, in canonical
// keys (a domain's other spellings are its own to test). A case is `refused`
// where the condition must be refused where it is written, never run. Every
// case is on a kind of listing no realistic scenario is: a library's events and
// returns, made up.

/** One case: a condition as written, one row's value (`null` for none), the run's `now`, and whether the row is kept. */
export type AutomationStudioRecordConditionDateCase = {
  written: Readonly<Record<string, unknown>>;
  cell: string | null;
  now: number;
  expected: boolean | "refused";
};

/** Tuesday 6 October 2026, 12:00 UTC. */
const NOW = Date.UTC(2026, 9, 6, 12);

const kept = (written: Record<string, unknown>, cell: string | null): AutomationStudioRecordConditionDateCase => ({ written, cell, now: NOW, expected: true });
const left = (written: Record<string, unknown>, cell: string | null): AutomationStudioRecordConditionDateCase => ({ written, cell, now: NOW, expected: false });
const refused = (written: Record<string, unknown>): AutomationStudioRecordConditionDateCase => ({ written, cell: "2026-10-01", now: NOW, expected: "refused" });

export const AUTOMATION_STUDIO_RECORD_CONDITION_DATE_CASES: readonly AutomationStudioRecordConditionDateCase[] = Object.freeze([
  // An absolute bound: its whole day where it states no time (t790).
  kept({ atLeast: "2026-09-19", as: "date" }, "Saturday 19 September 2026 at 00:10"),
  left({ atLeast: "2026-09-19", as: "date" }, "Friday 18 September 2026 at 23:59"),
  kept({ atLeast: "19 September 2026", atMost: "2026-09-21" }, "Monday 21 September 2026 at 22:00"),
  left({ atLeast: "19 September 2026", atMost: "2026-09-21" }, "22 Sep 2026"),
  kept({ greaterThan: "2026-09-19" }, "Sep 20, 2026"),
  left({ greaterThan: "2026-09-19" }, "2026-09-19 23:00"),
  kept({ lessThan: "2026-09-19 18:00" }, "2026-09-19 17:59"),
  left({ lessThan: "2026-09-19 18:00" }, "2026-09-19 18:00"),
  kept({ atLeast: "2026-10-01", as: "date" }, "3 days ago"),
  // A row stating no date the bound can read is never kept, `not` or no `not`.
  left({ atLeast: "2026-09-19", as: "date" }, "Date to be confirmed"),
  left({ atLeast: "2026-09-19", as: "date", not: true }, "Date to be confirmed"),
  left({ atLeast: "2026-09-19", as: "date", not: true }, null),
  left({ atLeast: "2026-09-19", as: "date" }, "02/03/2026"),
  kept({ atLeast: "2026-09-19", as: "date", not: true }, "2026-09-01"),
  // A bound relative to the run's `now` (t800): today and yesterday are whole days, `<n> <unit> ago` and now instants.
  kept({ atLeast: "today", as: "date" }, "Today 09:00"),
  kept({ atLeast: "today" }, "2026-10-06"),
  left({ atLeast: "today" }, "yesterday"),
  kept({ atLeast: "yesterday" }, "Posted yesterday"),
  left({ atLeast: "yesterday" }, "2 days ago"),
  kept({ atLeast: "7 days ago" }, "6 days ago"),
  left({ atLeast: "7 days ago" }, "8 days ago"),
  kept({ atLeast: "7 days ago" }, "2026-09-29 13:00"),
  left({ atLeast: "7 days ago" }, "2026-09-29"),
  kept({ atLeast: "48 hours ago" }, "2 days ago"),
  kept({ atLeast: "an hour ago" }, "30 minutes ago"),
  left({ greaterThan: "2 weeks ago" }, "Posted 2 weeks ago"),
  kept({ atMost: "now" }, "just posted"),
  left({ atMost: "now" }, "Tomorrow, 09:30"),
  left({ atLeast: "3 days ago", not: true }, "Date to be confirmed"),
  // `within`: from n units before the run's `now` up to it, both ends included.
  kept({ within: "7 days" }, "3 days ago"),
  kept({ within: "7 days" }, "7 days ago"),
  left({ within: "7 days" }, "8 days ago"),
  kept({ within: "7 days" }, "2026-09-29 12:00"),
  // A value stating only a day compares by whole days (G1): the span is the day of now - n through the day of now.
  kept({ within: "7 days" }, "2026-09-29"),
  kept({ within: "7 days" }, "29 Sep 2026"),
  kept({ within: "7 days" }, "Sep 29, 2026"),
  left({ within: "7 days" }, "2026-09-28"),
  left({ within: "7 days" }, "28 Sep 2026"),
  kept({ within: "7 days" }, "2026-10-06"),
  left({ within: "7 days" }, "2026-10-07"),
  left({ within: "7 days" }, "7 Oct 2026"),
  kept({ within: "1 week" }, "Sep 29, 2026"),
  left({ within: "1 week" }, "Sep 28, 2026"),
  kept({ within: "1 day" }, "Posted yesterday"),
  left({ within: "1 day" }, "2026-10-04"),
  kept({ within: "2 days" }, "2026-10-04"),
  // A value stating a time keeps the instants [now - n, now].
  left({ within: "7 days" }, "2026-09-29 11:59"),
  kept({ within: "7 days" }, "29 Sep 2026 at 12:00"),
  left({ within: "7 days" }, "2026-10-06 12:01"),
  kept({ within: "7 days" }, "2026-10-06 11:59"),
  // Minutes and hours stay instants, even for a day-only value.
  left({ within: "48 hours" }, "2026-10-04"),
  kept({ within: "48 hours" }, "2026-10-05"),
  kept({ within: "7 days" }, "Today"),
  left({ within: "7 days" }, "Tomorrow, 09:30"),
  left({ within: "7 days" }, "1d 0h left"),
  kept({ within: "1 week", as: "date" }, "6 days ago"),
  kept({ within: "48 hours" }, "yesterday"),
  left({ within: "48 hours" }, "3 days ago"),
  left({ within: "30 minutes" }, "an hour ago"),
  kept({ within: "30 minutes" }, "just now"),
  kept({ within: "7 days", not: true }, "8 days ago"),
  left({ within: "7 days", not: true }, "3 days ago"),
  left({ within: "7 days", not: true }, "Date to be confirmed"),
  left({ within: "7 days", not: true }, null),
  kept({ within: "14 days", atMost: "yesterday" }, "Posted 3 days ago"),
  left({ within: "14 days", atMost: "yesterday" }, "Today 08:00"),
  // A compact age in the row, as a feed prints it (t800): "6d", "45m", "3h ago".
  kept({ within: "7 days" }, "6d"),
  kept({ within: "7 days" }, "1w"),
  left({ within: "7 days" }, "2w"),
  left({ within: "7 days" }, "9d"),
  kept({ within: "30 minutes" }, "20m"),
  left({ within: "30 minutes" }, "45min"),
  kept({ within: "48 hours" }, "47h"),
  kept({ within: "1 hour" }, "40s"),
  kept({ atLeast: "7 days ago" }, "3h ago"),
  left({ atLeast: "7 days ago" }, "3w"),
  left({ within: "7 days" }, "45"),
  // Refused where written: no year, a day and month either way, a span no unit fixes, two kinds of bound.
  refused({ atLeast: "Sep 19", as: "date" }),
  refused({ atLeast: "02/03/2026" }),
  refused({ atLeast: "next week" }),
  refused({ atLeast: "30+ days ago" }),
  refused({ atLeast: "3 months ago" }),
  refused({ atLeast: "tomorrow" }),
  refused({ within: "7" }),
  refused({ within: "0 days" }),
  refused({ within: "3 months" }),
  refused({ within: "a week ago" }),
  refused({ within: 7 }),
  refused({ within: "7 days", atLeast: 4 }),
  refused({ within: "7 days", as: "number" }),
  refused({ within: "7 days", is: "absent" })
]);
