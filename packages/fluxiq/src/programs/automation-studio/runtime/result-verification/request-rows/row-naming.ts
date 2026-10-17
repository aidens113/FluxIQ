// How a judge's words name a row: by a prefix of its label that tells it apart
// from every other row of its read, or by an id it carries.
//
// A judge names rows the way a person does -- "Lumo Audio Drift Pro", "Aurelle
// Echo B0J5MCMBAY" -- so a row counts as named by the shortest start of its
// label, at least four words, that no other row of the read shares, or by a
// letters-and-digits run of six or more from it that no other row holds. Four
// words, because three name a product line, and a read holds many of one line:
// live run `run-muw60j7c-bb7c9a62`'s "Aurelle Pods Fit" is three rows kept and
// one left out, and only the whole of the left-out label tells it apart.
//
// **Or by Core's short id (t599).** A label whose distinguishing start is ten
// words long (A8 everything-store `run-mv8id5vg-ed7b89fe`) is named, too, by
// the six-character id Core gives it (`row-id.ts`), which the judge's copy
// shows before each left-out row a judge must still name
// (`summary-with-row-ids.ts`). The id is the label's, so it is counted only
// where no other row of the read has the same one or holds it in its text.
//
// **And how a read is named (t691).** A yes over a row another read stored
// names that read beside it (`unquoted-rows.ts`): by its whole node id, or by
// the last dot-separated part a judge writes for it (`s14`).

import { AutomationStudioRequestRowId } from "./row-id.ts";
import { automationStudioRequestRowIds, automationStudioRequestRowWords } from "./words.ts";

/** The ways a row may be named: the words of its distinguishing prefix, and its own ids. */
export type AutomationStudioRequestRowNaming = { prefix: string[]; ids: string[] };

/** Where a text's node-id-shaped tokens break: anything that cannot be part of one. */
const TOKEN_BREAK = /[^\p{L}\p{N}_.-]+/u;

/** A token's leading and trailing dots and dashes, which end a sentence rather than an id. */
const TOKEN_EDGES = /^[.-]+|[.-]+$/gu;

/** The fewest words a prefix that names a row has, unless the label is shorter. */
const PREFIX_MIN_WORDS = 4;

/** How a row is named among the other rows of its read (`pool`, which may hold it too). */
export function automationStudioRequestRowNaming(label: string, pool: readonly string[]): AutomationStudioRequestRowNaming {
  const words = wordsOf(label);
  const others = [...new Set(pool)].filter((other) => other !== label);
  const otherWords = others.map(wordsOf);
  let prefix = words;
  for (let length = Math.min(PREFIX_MIN_WORDS, words.length); length <= words.length; length += 1) {
    if (!otherWords.some((other) => other.length >= length && words.slice(0, length).every((word, index) => other[index] === word))) {
      prefix = words.slice(0, length);
      break;
    }
  }
  const othersText = others.join("\n").toUpperCase();
  const own = automationStudioRequestRowIds(label).filter((id) => !othersText.includes(id));
  // Core's short id, unless another row of the read has it too or holds it in its text (header).
  const core = AutomationStudioRequestRowId.of(label);
  const shared = othersText.includes(core) || others.some((other) => AutomationStudioRequestRowId.of(other) === core);
  return { prefix, ids: shared || own.includes(core) ? own : [...own, core] };
}

/** Whether a text names a row: its distinguishing prefix, word for word, or one of its ids. */
export function automationStudioRequestTextNamesRow(text: string, naming: AutomationStudioRequestRowNaming): boolean {
  if (naming.ids.length) {
    const ids = new Set(automationStudioRequestRowIds(text));
    if (naming.ids.some((id) => ids.has(id))) return true;
  }
  return naming.prefix.length > 0 && contains(wordsOf(text), naming.prefix);
}

/**
 * Whether a text names a read by its node id (t691, `unquoted-rows.ts`): the
 * whole id, or its last dot-separated part on its own -- a judge writes `s14`
 * for `flow.part.s14` -- compared without case. A part is a whole token, so
 * `s14` is not named by `s140`.
 */
export function automationStudioRequestTextNamesRead(text: string, nodeId: string): boolean {
  const id = nodeId.toLowerCase();
  const last = id.slice(id.lastIndexOf(".") + 1);
  return text.toLowerCase().split(TOKEN_BREAK).some((raw) => {
    const token = raw.replace(TOKEN_EDGES, "");
    return token.length > 0 && (token === id || token === last || token.endsWith(`.${last}`));
  });
}

function wordsOf(text: string): string[] {
  return automationStudioRequestRowWords(text).map((word) => word.word);
}

function contains(words: readonly string[], run: readonly string[]): boolean {
  for (let start = 0; start + run.length <= words.length; start += 1) {
    if (run.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}
