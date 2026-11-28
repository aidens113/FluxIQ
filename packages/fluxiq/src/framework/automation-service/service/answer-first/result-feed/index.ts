// How the attempt feeds its one result (`../result/`) and reads it back: the feed (`./feed.ts`), what one read is
// as the ledger takes it (`./read-of.ts`), the output a read writes (`./writes-of.ts`), and the paging a move of a list
// settles (`./list-move.ts`), and what a domain declared of a list's paging (`./list-pager.ts`), and the reads that left
// the draft, kept as the judge's evidence (`./left-reads.ts`, t1067), and each kept row with the values the result's
// processing read on it, beside the asked columns (`./kept-key-rows.ts`, t1072), and the pages a read step that comes back
// into the draft brings back with it (`./returned-pages.ts`, t1085), and the fields reads of one list by several
// extractions share, which say when two of their rows are one (`./shared-fields.ts`, t1091).
export * from "./feed.ts";
export * from "./left-reads.ts";
export * from "./kept-key-rows.ts";
export * from "./list-move.ts";
export * from "./list-pager.ts";
export * from "./readiness.ts";
export * from "./read-evidence.ts";
export * from "./restore.ts";
export * from "./read-of.ts";
export * from "./writes-of.ts";
export * from "./place-of.ts";
export * from "./returned-pages.ts";
export * from "./shared-fields.ts";
