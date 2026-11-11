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
//
// **A closing item that runs on is not dropped (t877, run `run-mw49972k-cebf67e5`).**
// "with columns title and price exactly as the shop shows them" split into
// "title" and "price exactly as the shop shows them", the second too long to be
// a name, and the reader answered `["title"]`: a partial list said as if whole.
// The build declared it as the saved read's schema and the domain narrowed the
// read to it, so the answer lost price with no error anywhere. Which of the
// item's leading words is the name ("price", or "order number" of "order number
// as shown") only the read's fields can say, and this reader has none. So when
// the item "and" or "&" introduced runs past a name, and is not an ordering,
// the list is answered empty -- nothing declared, every column kept, as for an
// instruction that names none -- and the array carries `cutShort`: the names
// read before the item and the item's leading words, longest first. The build's
// assembly, which knows the fields, takes the leading name that is one of them
// (`../authoring/assembled-record-output.ts`), and otherwise declares nothing
// and notes it in the step log.
//
// **A colon after an item ends the list (run `run-mwblz4aq-0baa810a`).**
// "columns author, comment and date: author is the username of whoever wrote
// it, ..." names its last column, then opens that column's explanation with a
// colon. The reader took "date: author is the username ..." as the closing
// item, found it ran on, and every leading-words candidate kept the colon
// ("date:"), which no column name holds, so the list was answered empty and the
// note said no named column was read. So the text before a colon in an item is
// that item, and the list ends with it; a colon that opens the list ("columns:
// a, b and c") leaves nothing before it and ends nothing. A leading-words
// candidate is also trimmed of its trailing punctuation, so a list that still
// runs on offers "date" rather than "date:".

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
 * A list whose closing item ran on past a column name (header): the names read
 * before it, and the item's leading words that could be a name, longest first.
 */
export type AutomationStudioFlowBootstrapInstructionColumnsCutShort = { named: string[]; leading: string[] };

/** The columns an instruction names; empty, with `cutShort` set, when its closing item ran on (header). */
export type AutomationStudioFlowBootstrapInstructionColumnList = string[] & { cutShort?: AutomationStudioFlowBootstrapInstructionColumnsCutShort };

/**
 * The columns the instruction named, in the order it named them, as the person
 * wrote them. Nothing here calls a provider.
 */
export function automationStudioFlowBootstrapInstructionColumns(instructionText: string): AutomationStudioFlowBootstrapInstructionColumnList {
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
    // A colon after an item opens its explanation: the item is the text before it, and the list ends with it (header).
    const piece = pieces[index]!.replace(/^[^A-Za-z0-9]+/u, "");
    const colon = piece.indexOf(":");
    const explained = colon >= 0;
    const name = (explained ? piece.slice(0, colon) : piece).replace(/[^A-Za-z0-9]+$/u, "").replace(/\s+/gu, " ").trim();
    if (!name) continue;
    if (ORDERING_PHRASE.test(name)) break;
    if (name.split(" ").length > MAX_COLUMN_WORDS) {
      if (CLOSING_SEPARATOR.test(separatorBefore)) return cutShort(names, name);
      break;
    }
    if (name.length <= MAX_COLUMN_NAME && COLUMN_NAME.test(name) && !names.includes(name)) names.push(name);
    if (explained || names.length >= MAX_COLUMNS) break;
  }
  return names;
}

/** The empty list a closing item that ran on answers, carrying what was read (header). */
function cutShort(named: readonly string[], item: string): AutomationStudioFlowBootstrapInstructionColumnList {
  const words = item.split(" ");
  const leading: string[] = [];
  for (let count = Math.min(MAX_COLUMN_WORDS, words.length - 1); count >= 1; count -= 1) {
    const name = words.slice(0, count).join(" ").replace(/[^A-Za-z0-9]+$/u, "");
    if (name && name.length <= MAX_COLUMN_NAME && COLUMN_NAME.test(name) && !named.includes(name) && !leading.includes(name)) leading.push(name);
  }
  const list: AutomationStudioFlowBootstrapInstructionColumnList = [];
  list.cutShort = { named: [...named], leading };
  return list;
}
