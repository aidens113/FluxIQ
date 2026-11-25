// The default page budget per delivery (D6, P-c).
//
// The 118 page views of the five t1015 bigbox recordings are 4,101 to 13,271
// characters (median 10,598, 90th percentile 12,294). 20,000 is about 1.5
// times the largest, so every recorded view arrives whole in one part and a
// larger page arrives in parts. Characters, not tokens, so the cut is the same
// whichever model reads it. A domain may declare its own (`./channel.ts`).

/** Characters of page text one delivery carries before the rest goes into parts. */
export const AUTOMATION_STUDIO_LLM_PAGE_BUDGET_CHARS = 20_000;
