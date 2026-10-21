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
// A row is named as any no's sentence names one: its whole label, Core's short
// id, or the start of its label (`../../refuted-no/named-rows.ts`). What a no
// whose defects Core finds none of comes to is `../unsupported-no.ts`.

export * from "./located-defects.ts";
