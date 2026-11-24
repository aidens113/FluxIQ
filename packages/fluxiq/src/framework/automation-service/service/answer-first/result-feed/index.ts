// How the attempt feeds its one result (`../result/`) and reads it back: the feed (`./feed.ts`), what one read is
// as the ledger takes it (`./read-of.ts`), the output a read writes (`./writes-of.ts`), and the paging a move of a list
// settles (`./list-move.ts`), and what a domain declared of a list's paging (`./list-pager.ts`).
export * from "./feed.ts";
export * from "./list-move.ts";
export * from "./list-pager.ts";
export * from "./readiness.ts";
export * from "./read-evidence.ts";
export * from "./restore.ts";
export * from "./read-of.ts";
export * from "./writes-of.ts";
export * from "./place-of.ts";
