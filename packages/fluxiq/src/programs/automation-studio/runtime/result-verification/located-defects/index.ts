// Each defect a no lists, looked for in Core's own record of the result it
// judged (t752).
//
// **Why.** A breadth rerun's trial stored exactly the rows asked for, and both
// judge calls said no: one for the way the Flow reads a value, which an earlier
// judge of the same build had advised, and a count of the rows; the other for a
// claim about a condition the request's own words refute. Neither named a row
// wrongly kept, a row missing or a wrong value. Core weighed their prose by
// patterns (`../../refuted-no/weigh.ts`), read "holds only 3 rows: ..." as a
// reason left standing, and the right answer was failed. Earlier judge errors
// lost correct answers the same way, each patched by one more pattern. A no now
// lists each defect it rests on (`diagnosis.defects`, `../../verdict/defects.ts`),
// and Core looks for each in its record (`../../refuted-no/record.ts`), never in
// prose:
//
// - `kept_not_asked` -- a row of the result the request does not ask for: a
//   stored answer row, never a working row (`../../read-account/working-sets.ts`).
// - `wrong_value` -- a stored answer row, and a column the result stores.
// - `asked_missing` -- a row the result lacks: a row a read saw and left out
//   that Core does not account for (not settled against the request's own
//   words, not also in the result), or, for rows the run never read or a row
//   Core holds no record of, a read whose own account says its list goes on
//   past what it read.
// - Every defect's `requestWords` run word for word in the request.
//
// **And an act the request asks for (t766).** A Flow that only acts -- saves,
// sends, adds to a cart -- stores no rows, so a no of its result had no row to
// name: every one came to unsure (`../agreement/unsupported-no.ts`), and its
// failures never reached a repair. A no may name an act instead, and Core
// looks for it in its record of the steps
// the run took (`./act-steps.ts`: each step of the Flow with what the run saw
// it change, and a build test's steps with their targets), never in prose
// (`./act-located.ts`):
//
// - `act_wrong` -- a step Core holds, by its node id, label or a build test's
//   number, that acts rather than reads.
// - `act_missing` -- what the act is done to, which no step Core holds names.
//
// The steps are evidence apart from the rows (supervisor, 2026-10-27): a
// request that owes records and asks for an act beside them takes an act
// defect too, and every row claim -- a row kept, missing or wrong -- still
// needs its row in the record, exactly as before.
//
// A row is named as any no's sentence names one: its whole label, Core's short
// id, or the start of its label (`../../refuted-no/named-rows.ts`). What a no
// whose defects Core finds none of comes to is `../unsupported-no.ts`.

export * from "./act-located.ts";
export * from "./act-steps.ts";
export * from "./located-defects.ts";
