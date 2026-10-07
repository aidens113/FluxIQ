// How each list read of a run went: the account the judgement and the
// re-author are shown (`accounts.ts`), the condition wording inside it
// (`condition.ts`), how its `dedupe` reads (`dedupe.ts`), the rows a
// condition removed by itself (`alone-rows.ts`),
// Core's sentence for it (`sentence.ts`), what stopped its paging (`stop.ts`),
// the columns its own conditions keep empty (`emptied-columns.ts`), the
// instruction's named columns no stored column reads (`unread-columns.ts`),
// and the summary as a model is shown it, without Core's `testedLabel`
// (`without-tested-label.ts`).
export * from "./accounts.ts";
export * from "./alone-rows.ts";
export * from "./condition.ts";
export * from "./dedupe.ts";
export * from "./judge-paging.ts";
export * from "./page-bound-sentence.ts";
export * from "./pages-clause.ts";
export * from "./emptied-columns.ts";
export * from "./sentence.ts";
export * from "./stop.ts";
export * from "./unread-columns.ts";
export * from "./without-tested-label.ts";
