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
// **A missing row is held to its own cells, and a row is named whole (t771).**
// Rerun round 6 social `run-mvrj7qg8-c20c132e`: judges gave a friend's own post,
// which a read left out, a group it does not have and called it missing; Core
// located the claim because the row existed, a wrong double no stood, and its
// advice led the build away from the right condition. An `asked_missing` row a
// read saw is found only where the defect gives the column and that row's own
// value in it that makes it asked for, and Core's record of the row's cells
// (`./row-cells.ts`: the cells the read sent beside each left-out row, or
// the value its condition tested) says that value -- or, where Core holds no
// cell of that column, the row's own label says it. A row is named by its whole
// label, Core's id for it, or its whole label first and more words after it,
// which tell apart rows sharing the label by a cell they name; never by a label
// found further on in its words (the invented "<author> — <group>, <date>" was
// taken for the stored row labelled <group>, and the judge told it "is a row the
// result holds").
//
// **And what a build's test would store (t771).** A test stores no record set;
// Core's record of it holds its answer's labels (`buildTest.stores`) as stored
// rows (`../refuted-no/record.ts`), so a kept row of a test is found, and a row
// its answer holds is never found missing.
//
// **And never by the one value a condition tested and left it out for (t785).**
// Run `run-mvskodlp-9966d618`: a read kept the rows whose column held one of
// the values the Flow wrote; both judges of a correct result called a row it
// left out missing, quoting that row's own value in the tested column, and
// t771's cell check located it -- the cell said it. The defect only restated
// that the judge disagreed with the condition's list. Where the row was left
// out by one `equals` condition of that column alone and the request's own
// words do not say the quoted value, the defect is not located, in Core's
// words naming the condition (`./tested-value-only.ts`); where the request
// says it, it is located as before.
//
// What a no whose defects Core finds none of comes to is `../unsupported-no.ts`.

export * from "./act-located.ts";
export * from "./act-steps.ts";
export * from "./condition-equals.ts";
export * from "./row-cells.ts";
export * from "./tested-cell.ts";
export * from "./tested-value-only.ts";
export * from "./located-defects.ts";
