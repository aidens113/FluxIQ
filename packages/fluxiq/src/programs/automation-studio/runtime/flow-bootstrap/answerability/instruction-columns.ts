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

const MAX_COLUMNS = 12;
const MAX_COLUMN_NAME = 32;
const MAX_COLUMN_WORDS = 3;
/** How far past the word "columns" a named list may run. */
const MAX_COLUMN_LIST = 200;

/** The words after "columns", where an instruction names them. */
const COLUMN_LIST = new RegExp(`(?<![A-Za-z0-9])columns?(?![A-Za-z0-9])([^.;\n]{0,${MAX_COLUMN_LIST}})`, "iu");
const COLUMN_NAME = /^[A-Za-z][A-Za-z0-9 _-]*$/u;
const COLUMN_SEPARATOR = /,|;| and | & /iu;

/**
 * The columns the instruction named, in the order it named them, as the person
 * wrote them. Nothing here calls a provider.
 */
export function automationStudioFlowBootstrapInstructionColumns(instructionText: string): string[] {
  const text = typeof instructionText === "string" ? instructionText : "";
  const listed = COLUMN_LIST.exec(text)?.[1];
  if (!listed) return [];
  const names: string[] = [];
  for (const part of listed.split(COLUMN_SEPARATOR)) {
    const name = part.replace(/^[^A-Za-z0-9]+/u, "").replace(/[^A-Za-z0-9]+$/u, "").replace(/\s+/gu, " ").trim();
    if (!name || name.length > MAX_COLUMN_NAME || !COLUMN_NAME.test(name)) continue;
    if (name.split(" ").length > MAX_COLUMN_WORDS || names.includes(name)) continue;
    names.push(name);
    if (names.length >= MAX_COLUMNS) break;
  }
  return names;
}
