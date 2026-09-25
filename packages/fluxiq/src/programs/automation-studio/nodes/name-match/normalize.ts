const SEPARATORS = /[\s_\-./]+/g;
const LOWER_THEN_UPPER = /([a-z0-9])([A-Z])/g;
const ACRONYM_THEN_WORD = /([A-Z]+)([A-Z][a-z])/g;

/**
 * Folds a written name to the form every comparison runs against: lower case,
 * with `_`, `-`, `.`, `/`, whitespace and camel-case humps all collapsed to one
 * space.
 *
 * This is what makes `web.output.dom-extract-list`,
 * `web.output.dom_extract_list` and `web.output.domExtractList` the same name.
 * A model that guesses the separator or the casing wrong has not named
 * anything unknown, so that miss must never reach a refusal. Camel case is
 * included because it is one of the likeliest forms a model writes an id it
 * half-remembers in: measured against the real web node set, splitting the
 * humps moved `filterList` -> `builtin.data.filter-list` from 0.10, far below
 * any workable floor, to 0.76.
 */
export function normalizeAutomationStudioName(written: string): string {
  return written
    .replace(ACRONYM_THEN_WORD, "$1 $2")
    .replace(LOWER_THEN_UPPER, "$1 $2")
    .replace(SEPARATORS, " ")
    .trim()
    .toLowerCase();
}
