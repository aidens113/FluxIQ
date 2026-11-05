// The item a row stands for, in its own few words, for an act that came with the row and not with a sentence
// naming its item. A forward run presses once per row of a list (`item` on its call), and its answer need not say
// which item it pressed, so "Save. Save. Save." would name no listing. The row is what a real read returned, never
// a word the model wrote, and the line is only what a person reads: it is put through the same word check as every
// other line of an act (`./words.ts`), held in memory beside the entry and never persisted (`./record.ts`).
//
// The first text cell of the row with a word in it, in the row's own order: what a read lists first is what names an
// item. A cell a read minted (`$`-named, a handle, an address or a link) is page plumbing, never a person's words.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioAttemptActCutItemWords } from "./cut-words.ts";

/** Columns that hold plumbing, not words: a read's minted fields, handles, addresses and links. */
const PLUMBING = /^(?:\$.*|evidence|.*(?:url|href|link|handle))$/iu;
const ADDRESS = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/|www\.)/iu;

/** The few words of the item `row` is, or `undefined` where it holds no text that names one. */
export function automationStudioAttemptActRowWords(row: JsonObject | undefined): string | undefined {
  if (row === undefined) return undefined;
  for (const [column, value] of Object.entries(row)) {
    if (typeof value !== "string" || PLUMBING.test(column)) continue;
    const words = value.replace(/\s+/gu, " ").trim();
    if (!/\p{L}{2}/u.test(words) || ADDRESS.test(words)) continue;
    return automationStudioAttemptActCutItemWords(words);
  }
  return undefined;
}
