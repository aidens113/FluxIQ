// Which item each act was on, for the line a person reads: "Save: Round pine dining table, 90cm" and not "Save" three times.
//
// In order, the first that says:
//
//   1. The answer's own sentence naming the item (`./item-words.ts`), or the row the call came with (`./row-words.ts`).
//   2. The row the act is tied to (`./row-ties.ts`, tie 3 is a press on a row's own page): that row's first text cell, as
//      a read returned it. Asked when the line is said, so a row tied late names the act too. A row that fits several
//      with different words names none of them.
//   3. For a press in no list, the words of the control's own card (`card`, the web domain's `actedOnCard`): a tile's
//      own words, or the heading of an item's own page. Never a row tie: these words are said, not matched to rows.
//   4. None: the line stays the control's name, or the generic line for its class.
//
// **Never the page's title.** Lane B's run-mw44rtn1-37dee092 added a product from a cart page's suggestion tiles, and
// the line read "Add to cart: <the cart page's title>": a title names the page, not what was acted on.
//
// Each is what a read or a page said, never a word the model wrote, and each goes through the person-words check when the
// line is said (`./words.ts`), which refuses a credential's shape.
//
// **All of it is in memory, on purpose.** What is persisted beside a Flow holds no page text, and carries across tasks
// and into later attempts, so a test forbids it (`./tests/record.test.ts`). The attempt's own result does carry the lines:
// that is a person's record and sits with the rows it read. So a record seeded from disk says the plain line for what it
// did before the restart, until a read of the same rows names it again (`./record.ts`).

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioAttemptActEntry } from "./contracts.ts";
import { automationStudioAttemptActRowIdentity } from "./identity/index.ts";
import { automationStudioAttemptActItemWords } from "./item-words.ts";
import { automationStudioAttemptActCutItemWords } from "./cut-words.ts";
import { automationStudioAttemptActRowWords } from "./row-words.ts";

/** The most rows whose words are held, the same bound the record holds rows to (`./row-ties.ts`); the oldest go first, and an act on one falls to its page's words. */
const MOST_ROWS = 5_000;

export class AutomationStudioAttemptActItems {
  private readonly own = new WeakMap<AutomationStudioAttemptActEntry, string>();
  private readonly cards = new WeakMap<AutomationStudioAttemptActEntry, string>();
  /** A row's digest to its own words. */
  private readonly rows = new Map<string, string>();

  /** A row a read returned, or a call came with. */
  noteRow(row: JsonObject): void {
    const digest = automationStudioAttemptActRowIdentity(row);
    const words = automationStudioAttemptActRowWords(row);
    if (digest === undefined || words === undefined) return;
    this.rows.delete(digest);
    this.rows.set(digest, words);
    if (this.rows.size > MOST_ROWS) this.rows.delete(this.rows.keys().next().value!);
  }

  /** What a call's answer said of the act, kept for as long as it was not said before. */
  noteAct(entry: AutomationStudioAttemptActEntry, said: { actedOn?: string | undefined; row?: JsonObject | undefined; card?: string | undefined }): void {
    const own = automationStudioAttemptActItemWords(said.actedOn) ?? automationStudioAttemptActRowWords(said.row);
    if (own !== undefined && !this.own.has(entry)) this.own.set(entry, own);
    const card = cardWords(said.card);
    if (card !== undefined && !this.cards.has(entry)) this.cards.set(entry, card);
  }

  /** The few words of the item `entry` was on, as far as anything says (header). */
  of(entry: AutomationStudioAttemptActEntry): string | undefined {
    return this.own.get(entry) ?? this.tied(entry) ?? this.cards.get(entry);
  }

  /** The words of the row the act is tied to, where every row it may be on says the same. */
  private tied(entry: AutomationStudioAttemptActEntry): string | undefined {
    const [first, ...rest] = entry.rows.map((row) => this.rows.get(row));
    return first !== undefined && rest.every((words) => words === first) ? first : undefined;
  }
}

/** A card's words cut to the few that tell it apart, or `undefined` where they hold no word. */
function cardWords(card: string | undefined): string | undefined {
  const words = card?.replace(/\s+/gu, " ").trim();
  return words !== undefined && /\p{L}{2}/u.test(words) ? automationStudioAttemptActCutItemWords(words) : undefined;
}
