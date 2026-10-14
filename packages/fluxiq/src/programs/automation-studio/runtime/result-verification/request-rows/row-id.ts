// Core's short id for a row, so a judge can name a left-out row without
// copying a long prefix of its label (t599).
//
// **Why.** A8 everything-store `run-mv8id5vg-ed7b89fe`: every yes over 12
// exact answers was held because rows a condition alone left out were not
// named beside a quote, and a row counts as named only by the shortest start
// of its label no other row of its read shares (`row-naming.ts`). The store's
// labels shared long prefixes, so that start was ten to twelve words for six of
// eight rows, and the labels carried no id of their own.
//
// **What the id is.** Six letters and digits, alternating, from a hash of the
// row's label -- never its position -- so the judge's copy that shows it
// (`summary-with-row-ids.ts`) and the checks that read a reply
// (`row-naming.ts`) compute the same id from the same label with nothing
// passed between them. Six, letters and digits both, so a reply's mention is
// found as any id is (`words.ts`, `automationStudioRequestRowIds`); no I, L, O,
// 0 or 1, which a judge copies wrong. Two labels of one read that hash alike
// share an id, and neither is then named by it (`row-naming.ts`): naming falls
// back to the label's prefix, which is always accepted too.
//
// **How the copy says it.** Before the row, `[row K4R7M2] `, which is no
// locator shape (`../../llm/harness/locator-text.ts`) and which
// `summary-reads.ts` takes off again wherever a row is read as its label.

/** The letters and digits an id alternates between: none a judge copies wrong. */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
/** How the judge's copy writes the id before a row (header). */
const SAID = /^\[row ([A-Z2-9]{6})\] /u;

export const AutomationStudioRequestRowId = Object.freeze({
  /** A label's id (header): the same label, the same id, in every summary. */
  of(label: string): string {
    let hash = 0x811c9dc5;
    for (const char of label) {
      hash ^= char.codePointAt(0)!;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    let id = "";
    for (let at = 0; at < 3; at += 1) {
      id += LETTERS[hash % LETTERS.length]!;
      hash = Math.floor(hash / LETTERS.length);
      id += DIGITS[hash % DIGITS.length]!;
      hash = Math.floor(hash / DIGITS.length);
    }
    return id;
  },

  /** The row with its label's id said before it (header); a row that already says one is given back as it is. */
  said(row: string, label: string): string {
    return SAID.test(row) ? row : `[row ${AutomationStudioRequestRowId.of(label)}] ${row}`;
  },

  /** The row without an id said before it. */
  unsaid(row: string): string {
    return row.replace(SAID, "");
  }
});
