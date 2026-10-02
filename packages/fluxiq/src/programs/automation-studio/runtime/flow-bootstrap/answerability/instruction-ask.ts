// What the instruction asks to be given back, read from the person's own words
// and nothing else.
//
// **Why it is read here rather than derived by a model.** Core already has two
// readings of an instruction, and neither can answer this question. The
// instructed consequences (`runtime/action-permissions/instructed.ts`) are
// derived by a model call and say which lasting acts the person authorised --
// which is a different question, and gating a build on a consequence class
// would refuse the wrong things. The result verification
// (`runtime/result-verification/`) asks a model whether a *finished* result
// answers the request, and a build has no result yet and must not spend a call
// to be told what its own instruction says. So what is left is a reading Core
// makes itself, for free, from the text.
//
// **What it looks for, and what it deliberately does not.** Only the words that
// name a set of rows as the thing wanted back. Every term below was checked
// against the instructions actually on record, and the near misses are the
// reason the list is short:
//
//   - `table` alone is out. "Book a table for two" asks for no rows at all, and
//     the booking wizard is one of the ten sites under test. `as a table`,
//     `in a table` and `table of` are never anything else, and the instruction
//     that produced this check -- "... as a table with four named columns" --
//     matches both those and `columns`.
//   - `list` alone is out, and so is `list the`. "List the bike for sale" is
//     the classifieds task: it publishes an advert. `list of` stays.
//   - `record` and `column` in the singular are out. "Delete the record for
//     order 1042" asks for a deletion.
//   - `export`, `collect` and `gather` are out. Each is as often about a file,
//     a confirmation or a form as about data ("export the invoice", "collect
//     the confirmation"), and a false refusal costs a whole build while a
//     missed one only leaves today's behaviour.
//
// The bias is deliberate and one-sided: a term earns its place by being
// unambiguous, not by catching more. An instruction that asks for rows in words
// no term here matches is simply not judged, which is where every instruction
// stood before.
import type { AutomationStudioFlowBootstrapInstructionAsk } from "./contracts.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "./instruction-columns.ts";

/** What the person's own sentence may cost in the feedback. */
const MAX_QUOTE = 200;

/**
 * The words and phrases that ask for a set of rows. A phrase matches across any
 * punctuation or spacing between its words, and a term never matches inside a
 * longer word, so `extract` does not match `extraction` -- both are listed --
 * and `columns` does not match `columnist`.
 */
const RECORD_SET_TERMS = [
  "records", "rows", "columns",
  "csv", "tsv", "spreadsheet", "dataset", "datasets",
  "as a table", "in a table", "table of", "list of",
  "scrape", "scrapes", "scraped", "scraping",
  "extract", "extracts", "extracted", "extracting", "extraction",
  "tabulate", "tabulated", "tabulating"
] as const;

const RECORD_SET_PATTERNS = RECORD_SET_TERMS.map((term) => new RegExp(
  `(?<![A-Za-z0-9])${term.split(" ").join("[^A-Za-z0-9]+")}(?![A-Za-z0-9])`,
  "iu"
));

/** Where the person's own sentence starts and ends. */
const SENTENCE_BOUNDARY = /[.;!?\n]/u;

/** What the instruction asks to be given back. Nothing here calls a provider. */
export function automationStudioFlowBootstrapInstructionAsk(instructionText: string): AutomationStudioFlowBootstrapInstructionAsk {
  const text = typeof instructionText === "string" ? instructionText : "";
  let asksAt: number | undefined;
  for (const pattern of RECORD_SET_PATTERNS) {
    const found = pattern.exec(text);
    if (found && (asksAt === undefined || found.index < asksAt)) asksAt = found.index;
  }
  if (asksAt === undefined) return { records: false, columns: [] };
  const quote = sentenceAt(text, asksAt);
  return { records: true, ...(quote ? { quote } : {}), columns: automationStudioFlowBootstrapInstructionColumns(text) };
}

/** The person's own sentence around a match, as they wrote it, bounded. */
function sentenceAt(text: string, at: number): string | undefined {
  let start = 0;
  for (let index = at - 1; index >= 0; index -= 1) {
    if (SENTENCE_BOUNDARY.test(text.charAt(index))) {
      start = index + 1;
      break;
    }
  }
  let end = text.length;
  for (let index = at; index < text.length; index += 1) {
    if (SENTENCE_BOUNDARY.test(text.charAt(index))) {
      end = index;
      break;
    }
  }
  const sentence = text.slice(start, end).replace(/\s+/gu, " ").trim();
  return sentence ? sentence.slice(0, MAX_QUOTE) : undefined;
}
