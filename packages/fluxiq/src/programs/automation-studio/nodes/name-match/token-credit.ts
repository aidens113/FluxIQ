import { automationStudioNameEditDistance } from "./edit-distance.ts";
import { automationStudioNameSynonymCredit } from "./synonyms.ts";

/**
 * At most one edit per this many characters of the longer token.
 *
 * Why a proportion rather than the flat bound `./similarity.ts` puts on a whole
 * name. That bound allows two edits from five characters up, because a
 * transposition costs two under plain Levenshtein and transposing is a common
 * slip. Across a *whole* name two edits is a small fraction. Inside a *single
 * token* it is not: two edits is how two different words look. `file` reaches
 * `filter` in two, `send` reaches `set` in two, `name` reaches `date` in two,
 * and admitting those would resolve `upload-file` to `builtin.data.filter-list`
 * -- a name this matcher is measured refusing, and must keep refusing.
 *
 * One edit in four characters admits every near token measured mattering
 * (`prce`/`price` 0.8, `ratng`/`rating` 0.833, `ratings`/`rating` 0.857,
 * `descripton`/`description` 0.909) and rejects all three of those pairs.
 *
 * A transposition inside one token of a longer name is not lost by this. The
 * whole-name rule sees the same two edits spread across a much longer string --
 * `web.output.dom-extarct_list` against `web.output.dom-extract_list` is two
 * edits in twenty-seven characters -- and resolves it there.
 */
const CHARACTERS_PER_EDIT = 4;

/**
 * The shortest token an edit may be forgiven in. Below it a token must match
 * exactly.
 *
 * A four-character token is one syllable, and one edit is a quarter of it: at
 * that length a slip and a different word are indistinguishable. `send` is one
 * edit from `end`, `name` from `game`, `file` from `filet`, `list` from `last`.
 * Measured, forgiving four-character tokens resolved `sendEmail` to
 * `builtin.control.end` at 0.285 -- a name this matcher is measured refusing,
 * and the exact failure this bound was added to close.
 *
 * Nothing is lost by it, because the case a short token would have rescued is
 * the case the whole-name rule in `./similarity.ts` already sees. `lst` for
 * `list` earns nothing here, and `web.output.dom_extract_lst` still resolves at
 * 0.963: one edit over twenty-seven characters, which is a typo by any reading.
 * What this bound gives up is only a short token mistyped inside a name too long
 * for the whole-name rule to notice -- and at four characters that is not a
 * thing that can be told from a different word anyway.
 */
const SHORTEST_FORGIVING_TOKEN = 5;

/**
 * How much one written token and one candidate token are worth to each other,
 * in 0..1: 1 for the same token, a length-normalised score for a near one, the
 * synonym credit for a different word for the same thing, and 0 for two tokens
 * with nothing to do with each other.
 *
 * Both arguments are single tokens of an already-normalised name -- one word of
 * what `./normalize.ts` produced -- not whole names.
 *
 * Why the comparison has to happen at this grain. The two token measures used
 * to be all-or-nothing on whole-token equality, so a written token one
 * character off a candidate's token counted for exactly as much as a written
 * token with no relation to it: nothing. With both token terms at zero, three
 * quarters of the blend in `./similarity.ts` is dead and the only surviving
 * signal is an edit distance taken over the candidate's *entire* string --
 * which is dominated by the parts of the name the written token never claimed,
 * and therefore falls as the candidate grows longer. Measured: `prce` scored
 * 0.077 against `product-price` and `name` scored 0.733 against `product-name`,
 * and the difference was not how close the words were. It was that one of them
 * happened to be spelled exactly.
 */
export function automationStudioNameTokenCredit(left: string, right: string): number {
  if (left.length === 0 || right.length === 0) return 0;
  if (left === right) return 1;
  return Math.max(nearTokenCredit(left, right), automationStudioNameSynonymCredit(left, right));
}

/**
 * A token within both bounds, worth what is left of it after the edits.
 *
 * The two cheap tests come first because this now runs for every pair of tokens
 * in every candidate, where the old whole-token comparison was a set lookup:
 * two names' tokens differing in length by more than the bound allows cannot
 * possibly be within it, since a difference of one character costs at least one
 * edit. Walking the distance matrix only for the pairs that could still qualify
 * keeps the whole matcher within a third of a millisecond per name.
 */
function nearTokenCredit(left: string, right: string): number {
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  if (longest < SHORTEST_FORGIVING_TOKEN) return 0;
  if ((longest - Math.min(left.length, right.length)) * CHARACTERS_PER_EDIT > longest) return 0;
  const distance = automationStudioNameEditDistance(left, right);
  return distance * CHARACTERS_PER_EDIT <= longest ? 1 - distance / longest : 0;
}
