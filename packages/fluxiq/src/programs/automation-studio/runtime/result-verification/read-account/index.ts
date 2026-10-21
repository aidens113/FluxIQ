// How each list read of a run went: the account the judgement and the
// re-author are shown (`accounts.ts`), the condition wording inside it
// (`condition.ts`), how its `dedupe` reads (`dedupe.ts`), the rows a
// condition removed by itself (`alone-rows.ts`), the rows two or more left
// out together (`together-rows.ts`), the one name every line
// gives a condition (`condition-name.ts`), what a presence test found on both
// sides (`presence.ts`),
// Core's sentence for it (`sentence.ts`), what stopped its paging (`stop.ts`),
// whether its step ran as the passes of a loop (`loop-passes.ts`) and the one
// account every pass adds up to (`looped-account.ts`),
// the columns its own conditions keep empty (`emptied-columns.ts`), the
// columns its rows store (`stored-columns.ts`), the
// instruction's named columns no stored column reads (`unread-columns.ts`),
// the summary as a model is shown it, without Core's `testedLabel`
// (`without-tested-label.ts`), and Core's flag on a read that kept every item
// it saw after an act repeated over a narrower read of the same list
// (`kept-every-row.ts`), and Core's words for a read of one part of a list
// that goes on past it (`list-continues.ts`), and Core's flag on a read whose
// rows are working rows, walked by a repeat before a later read of the same
// list (`working-rows.ts`, t752), the two flags deciding "one target" alike
// (`same-target.ts`), and the one rule for which record sets that flag makes
// working rows, never the result (`working-sets.ts`).
export * from "./accounts.ts";
export * from "./alone-rows.ts";
export * from "./condition.ts";
export * from "./condition-name.ts";
export * from "./dedupe.ts";
export * from "./judge-paging.ts";
export * from "./kept-every-row.ts";
export * from "./list-continues.ts";
export * from "./loop-passes.ts";
export * from "./looped-account.ts";
export * from "./page-bound-sentence.ts";
export * from "./read-parameters.ts";
export * from "./same-target.ts";
export * from "./pages-clause.ts";
export * from "./presence.ts";
export * from "./emptied-columns.ts";
export * from "./sentence.ts";
export * from "./stop.ts";
export * from "./stored-columns.ts";
export * from "./together-rows.ts";
export * from "./unread-columns.ts";
export * from "./without-tested-label.ts";
export * from "./working-rows.ts";
export * from "./working-sets.ts";
