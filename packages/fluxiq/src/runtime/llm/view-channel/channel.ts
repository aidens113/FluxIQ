// What the window needs to know of a domain's page channel (D1, D6).
//
// `member` is the key of a tool result under which the domain puts its page
// view (P-b; the web domain's `pageView`). `budgetChars` is the most page text
// one delivery carries before the rest goes into parts (P-c); absent, Core's
// default (`./budget.ts`). It bounds payload size only: nothing ends or resets
// a round or a run on it.

/** A declared page channel, as the evidence window reads it. */
export type AutomationStudioLlmPageChannel = { member: string; budgetChars?: number | undefined };
