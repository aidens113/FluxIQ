// Whether the request asks for every result it looks through, rather than for
// a kind of thing (framework plan P5; debug run-mvtdoyf3-47ffaac1, fixes F1 and
// F3).
//
// **Why.** "Search the catalog for garden tools and list every result on the
// first page, leaving out reference copies" asks for every row the search
// shows, less the one exclusion it states. The words it searched by say where
// to look; they are not a kind the rows must be. Under such a request every row
// a read left out needs an exclusion the request itself states, and a no that
// holds a kept row only to the searched words cannot be what that row fails. A
// request for a kind of thing ("Find garden gloves and list them") is not read
// so: there the named thing is the cohort (t628).
//
// **What counts, and only that.** A quantifier -- "every", "each", "all" (with
// an optional "of" and "the") -- before a noun any list request uses for its
// rows ("result", "item", "listing", "entry", "row", "hit"), with at most two
// words between them ("every search result", "all the results"), none of them
// a word that narrows the rows by a judgement of its own ("matching",
// "relevant", "qualifying", "eligible", "suitable", "valid"). Generic list
// words only; nothing here names a site, a product or a scenario.

/** The nouns a list request calls its rows by. */
const ROW_NOUN = String.raw`(?:results?|items?|listings?|entries|entry|rows?|hits?)`;

/** The words between the quantifier and the noun that narrow the rows by a judgement, which leave the request one for a kind. */
const NARROWING = new Set(["matching", "relevant", "qualifying", "eligible", "suitable", "valid"]);

/** A quantifier, up to two words, and a row noun, whole words, any case. */
const EVERY_RESULT = new RegExp(String.raw`\b(?:every|each|all(?:\s+of)?(?:\s+the)?)\s+((?:[\w'-]+\s+){0,2}?)${ROW_NOUN}\b`, "giu");

/** True where the request's own words ask for every result it looks through (header). */
export function automationStudioRequestAsksEveryResult(requestText: string | undefined): boolean {
  if (!requestText) return false;
  for (const match of requestText.matchAll(EVERY_RESULT)) {
    const between = (match[1] ?? "").toLowerCase().split(/\s+/u).filter(Boolean);
    if (!between.some((word) => NARROWING.has(word))) return true;
  }
  return false;
}
