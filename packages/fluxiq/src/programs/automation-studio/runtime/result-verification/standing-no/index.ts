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
// no in `../agreement.ts`, and passed on by the build-test judge and the trial
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
// This directory reads nothing of a run but those records, so the gates import
// it without the reads that import the flow-bootstrap back; the builder of a
// record, which does, is `../standing-no-record/`.
export * from "./contradiction.ts";
export * from "./memory.ts";
export * from "./types.ts";
