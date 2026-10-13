// The columns an instruction names, read from the person's own words.
//
// One reader, used twice. The answerability check quotes them back in its
// feedback (`./instruction-ask.ts`), and the build's authoring declares them as
// the schema of an extraction whose author declared none
// (`../authoring/instruction-record-columns.ts`), so every extraction Flow
// stores the columns that were asked for and not the helper columns it read
// only to filter by (live run 12, `plus` and `ad`).
//
// What it reads is deliberately narrow: the words after "column" or "columns",
// up to the end of the sentence, split at commas, semicolons, "and" and "&".
// A name is kept only when it looks like a column name -- a letter first, at
// most three words, at most 32 characters -- so the rest of a long sentence is
// not mistaken for one. An instruction that names its columns some other way
// names none here, and the Flow keeps every column it reads, as before.
//
// **Where the list ends (t515).** Live run `run-mv6v2kzn-d593231f` named its
// columns, then how to write one, then "newest posting first", and the reader
// took the ordering as a fourth column: every judge was told a column existed
// that no field read. So the list ends at the first of: the comma after an item
// that "and" or "&" introduced (the list's last item, as English closes one);
// a part too long to be a name (a clause); or an ordering phrase -- one ending
// in "first" or "last", or opening with "sorted", "ordered", "ranked", "sort
// by" or "order by". A part refused only for its characters ("price (GBP)") is
// still skipped and the list read on.

const MAX_COLUMNS = 12;
const MAX_COLUMN_NAME = 32;
const MAX_COLUMN_WORDS = 3;
/** How far past the word "columns" a named list may run. */
const MAX_COLUMN_LIST = 200;

/** The words after "columns", where an instruction names them. */
const COLUMN_LIST = new RegExp(`(?<![A-Za-z0-9])columns?(?![A-Za-z0-9])([^.;\n]{0,${MAX_COLUMN_LIST}})`, "iu");
const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9 _-]*$/u;
/** Split keeping each separator, so the reader knows which one introduced an item. */
const COLUMN_SEPARATOR = /(,|;| and | & )/iu;
const CLOSING_SEPARATOR = /^(?: and | & )$/iu;
/** An ordering said after the columns: "newest first", "sorted by price", "order by date". */
const ORDERING_PHRASE = /^(?:sorted|ordered|ranked|(?:sort|order) by)(?: |$)|(?:^| )(?:first|last)$/iu;

/**
 * The columns the instruction named, in the order it named them, as the person
 * wrote them. Nothing here calls a provider.
 */
export function automationStudioFlowBootstrapInstructionColumns(instructionText: string): string[] {
  const text = typeof instructionText === "string" ? instructionText : "";
  const listed = COLUMN_LIST.exec(text)?.[1];
  if (!listed) return [];
  const names: string[] = [];
  const pieces = listed.split(COLUMN_SEPARATOR);
  let closing = false;
  for (let index = 0; index < pieces.length; index += 2) {
    const separatorBefore = index === 0 ? "" : pieces[index - 1]!;
    // The item after "and" was the list's last; a comma after it ends the list.
    if (closing && !CLOSING_SEPARATOR.test(separatorBefore)) break;
    if (CLOSING_SEPARATOR.test(separatorBefore)) closing = true;
    const name = pieces[index]!.replace(/^[^A-Za-z0-9]+/u, "").replace(/[^A-Za-z0-9]+$/u, "").replace(/\s+/gu, " ").trim();
    if (!name) continue;
    if (name.split(" ").length > MAX_COLUMN_WORDS || ORDERING_PHRASE.test(name)) break;
    if (name.length > MAX_COLUMN_NAME || !COLUMN_NAME.test(name) || names.includes(name)) continue;
    names.push(name);
    if (names.length >= MAX_COLUMNS) break;
  }
  return names;
}
