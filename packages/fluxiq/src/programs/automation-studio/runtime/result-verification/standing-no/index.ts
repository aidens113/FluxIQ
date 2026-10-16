// An exclusion a standing no upheld holds across a build's trials (t633).
//
// **Why.** A8 wave 8 bigbox `run-mv9gbsm5-2957581c`: a build swung between two
// Flows. One kept a row its judges rightly called not the kind of thing the
// request asks for, and was judged no. The other left that row out -- several
// of its conditions left it out together, which no read account names -- and
// stored exactly the rows asked for; its judges said no, asking to remove the
// very conditions that left the row out. Core weighed each no as if fresh, so
// every move was closed off, and the build ran out of tries.
//
// **What Core keeps.** Each build test judged no carries Core's own record of
// it (`./types.ts`; built by `../standing-no-record/` on a build test's double
// no in `../agreement/`, and passed on by the build-test judge and the trial
// services outside the feedback a model is shown): the rows it stored, the
// conditions it read with, the stored rows a standing no called not the asked
// kind (t628's path), and the conditions each standing no asks to remove. The
// gate that keeps a build's trials
// (`../../flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`,
// `../../flow-bootstrap/candidate/trial-gate.ts`) keeps the records that upheld
// rows (`./memory.ts`), and weighs a later no whose remedy would take back
// exactly those rows as contradicted by the build's own record
// (`./contradiction.ts`): not taken, so the trial is unsure, never a yes, and
// the builder is told why in Core's words.
//
// **And the conditions its record showed keep out only rows the request does
// not ask for (t641).** A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1`: a
// revision stored exactly the rows asked for, and judges' misread advice got
// two of its conditions dropped one revision after another, though Core's own
// record showed each left out, by itself, only rows another copy of which was
// in the result or whose value failed the request's own words. The record's
// conditions now carry where they stand and those rows (`keptOut`); the gates
// keep each such condition as its revision wrote it (`./kept-conditions.ts`,
// found by `./written-conditions.ts`), on the result they keep for each trial,
// and the submission controller refuses once a revision that drops or changes
// one (`./kept-condition-drop.ts`). A record read back from a port is read by
// `./record-shape.ts`.
//
// **And sets of conditions that left rows out only together, and steps that
// chose the request's own words (t666).** A set whose every such row Core's
// record accounts for is kept as one (`./kept-conditions.ts`, `members`), and
// refused once where a plan writes none of it (`./kept-condition-drop.ts`). A
// step before the read that chose, in a named group, an option whose words are
// the request's own is found in the trial's feedback, and a plan that no longer
// has it and tests those words nowhere gets a one-time hint
// (`./kept-steps.ts`).
//
// This directory reads nothing of a run but those records, a trial's
// feedback and the plans the gates hold, so the gates import it without the reads that import the
// flow-bootstrap back; the builder of a record, which does, is
// `../standing-no-record/`.
export * from "./contradiction.ts";
export * from "./kept-condition-drop.ts";
export * from "./kept-conditions.ts";
export * from "./kept-steps.ts";
export * from "./memory.ts";
export * from "./record-shape.ts";
export * from "./types.ts";
export * from "./written-conditions.ts";
