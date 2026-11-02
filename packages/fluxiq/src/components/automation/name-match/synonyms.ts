/**
 * How much one word standing for another is worth when two tokens of a name
 * are compared.
 *
 * It sits strictly below the weakest credit a near token can earn (one edit in
 * a five-character token, 0.8 -- see `./token-credit.ts`), because a *different
 * word* for the same thing is weaker evidence than a *misspelling* of the right
 * word. That ordering is what stops the vocabulary below from ever outranking a
 * genuine near match, and it is asserted rather than left to arithmetic.
 */
const SYNONYM_CREDIT = 0.7;

/**
 * Words that name the same thing when a name is built out of them, grouped.
 *
 * Why this exists at all. Every other signal in this directory compares
 * characters, and no amount of character comparison brings `url` near `link`:
 * they share one letter and are two entirely different spellings of one idea.
 * Yet "with columns name, price, rating and url" is what a person asks for and
 * what a model then writes, against a set of names where the same column is
 * called `link`. Measured against a real catalog's detected names, `url`
 * scored 0.042 -- a sixth of the floor -- and the clause was dropped. That is a
 * refusal caused by a choice of word, which is exactly what the standing rule
 * forbids: a failure must come from there being no plausible answer.
 *
 * Why it is a bounded vocabulary rather than a dictionary. A general thesaurus
 * would make this matcher credulous -- almost any two words are synonyms of
 * something -- and the cost of a wrong resolution is a run that reads the wrong
 * value. So a group earns its place by being a word pair a model has actually
 * been measured writing, at the coarseness a *name* is built at. Three groups,
 * ten words:
 *
 * - addressing. `url`, `link` and `href` are one idea with three spellings, and
 *   it is the miss measured most often: the words a person says are `url` or
 *   `link` and the name a page's own markup suggests is the other one. `uri` is
 *   deliberately absent -- it is one edit from `url` across a three-character
 *   word, so the near-token rule already resolves it and a second mechanism for
 *   the same pair would only be another thing to keep in step.
 * - the human-readable name of a thing. `title`, `name`, `heading` and `label`
 *   are what the one field gets called depending on who wrote the schema, and
 *   `title` for `name` was measured missing on two independent paths.
 * - a monetary quantity. `price`, `cost` and `amount`.
 *
 * Why it lives in Core rather than beside one caller. It is the same kind of
 * knowledge as `./normalize.ts`'s rule that a camel-case hump is a separator:
 * how names are spelled in English, not what any one domain's names mean. Held
 * here, a node id, a parameter name and a name inside a parameter value are all
 * corrected by one vocabulary, and there is one place to argue about it.
 *
 * Every entry is a string in a list -- data this file compares and never a
 * member it declares -- so naming the web's own spelling of an address here
 * teaches Core nothing about the web.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["url", "link", "href"],
  ["title", "name", "heading", "label"],
  ["price", "cost", "amount"]
];

/**
 * How much two tokens are worth to each other as different words for one
 * thing: `SYNONYM_CREDIT` when both are spelled exactly as one group lists
 * them, and 0 otherwise.
 *
 * Both sides must be spelled exactly. A misspelled synonym (`titel` for
 * `name`) is two guesses stacked on each other, and stacking them is how a
 * matcher stops being able to say why it answered what it did.
 */
export function automationStudioNameSynonymCredit(left: string, right: string): number {
  if (left === right || left.length === 0 || right.length === 0) return 0;
  return SYNONYM_GROUPS.some((group) => group.includes(left) && group.includes(right)) ? SYNONYM_CREDIT : 0;
}
