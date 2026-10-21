// Barrel for what a model may read of text a domain wrote: a failure's own
// `expected` and `actual`, held to the rule that nothing says how a control was
// found (`failure-text.ts`, t426). The locator screen it builds on is the
// harness's (`../harness/locator-text.ts`). A control's own words, the one
// name a model may read for it (`control-words.ts`, t431), are the page's and
// are screened only for locators, match scores and finding-only words
// (`control-text.ts`, t748).
export * from "./control-text.ts";
export * from "./sayable-text.ts";
export * from "./failure-text.ts";
export * from "./control-words.ts";
