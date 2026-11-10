// Whether the person's latest words clearly ask for a consequential call (U5,
// `panel-design.md` section 4). Deterministic and conservative: the model's
// opinion never enters, and every doubt answers "no", which costs one press of
// Allow. A false "yes" is the dangerous direction.
//
// All of these must hold:
//
// 1. **Said as a request** (`./said-as-request.ts`): no negation, condition or
//    choice anywhere, and no question unless put as a request.
// 2. **A class verb, said as a command.** For every gated class of the call,
//    one of its words (`./class-verbs.ts`) opens a clause, after at most a few
//    leading words ("please", "can you", "go ahead and"). A verb inside a
//    quotation, inside a name ("open Delete old rows"), or after other words
//    ("how to delete", "explain why deleting") is not a command.
// 3. **The named object is the target, and that command's object.** Every item
//    the call acts on is named by its whole name, or -- with "this", "these" or
//    "selected" -- is what the panel has selected: the innermost thing selected,
//    or of the kind the words say ("this project"). The name or the pointing
//    word follows a gated class's command with only small words, kind words and
//    other named items between ("delete the Flows X and Y"), and nothing after
//    it in its clause moves the act elsewhere ("remove X from the list"). Two
//    items sharing a name are not named by it.
// 4. **No more than the named items.** A call whose target cannot be listed
//    (an unknown count, a "clean up everything", an input that names more than
//    its target: `PanelAssistantTarget.partial`) is never clearly asked.

import type { PanelAssistantContext, PanelAssistantTarget, PanelAssistantTargetItem } from "../types.ts";
import { PANEL_ASSISTANT_CLASS_VERBS } from "./class-verbs.ts";
import type { PanelAssistantGatedClass } from "./gated-class.ts";
import { PANEL_ASSISTANT_REQUEST_WORDS as WORDS } from "./request-words.ts";
import { panelAssistantSaidAsRequest } from "./said-as-request.ts";
import { panelAssistantSelected } from "./selected.ts";
import { panelAssistantSpokenWords, type PanelAssistantSpokenWord } from "./spoken-words.ts";

/** What the decision reads: the person's words, the call's gated classes, what it targets, and what is selected. */
export type PanelAssistantConsentInput = {
  words: string;
  classes: readonly PanelAssistantGatedClass[];
  target: PanelAssistantTarget | undefined;
  context: PanelAssistantContext;
};

type Span = { start: number; end: number };
type Reading = { words: PanelAssistantSpokenWord[]; spans: Map<PanelAssistantTargetItem, Span[]>; names: Span[]; commands: Map<number, PanelAssistantGatedClass> };

/** True only when the words clearly ask for exactly this call; see the header. */
export function panelAssistantClearlyAsked(input: PanelAssistantConsentInput): boolean {
  const target = input.target;
  if (!target || target.items.length === 0 || target.partial === true || input.classes.length === 0) return false;
  const words = panelAssistantSpokenWords(input.words);
  if (!words.length || !panelAssistantSaidAsRequest(words)) return false;
  const spans = nameSpans(words, target.items);
  const names = [...spans.values()].flat();
  const commands = commandVerbs(words, input.classes, names);
  const said = new Set(commands.values());
  if (!input.classes.every((gated) => said.has(gated))) return false;
  const reading: Reading = { words, spans, names, commands };
  return target.items.every((item) => named(reading, item) || pointedAt(reading, item, input.context));
}

/** Where each item's whole name stands in the words; nowhere for a one-letter name, or a name two items share. */
function nameSpans(words: readonly PanelAssistantSpokenWord[], items: readonly PanelAssistantTargetItem[]): Map<PanelAssistantTargetItem, Span[]> {
  const names = items.map((item) => trimmed(panelAssistantSpokenWords(item.name ?? "").map(({ word }) => word)));
  const keys = names.map((name) => name.join(" "));
  const spans = new Map<PanelAssistantTargetItem, Span[]>();
  items.forEach((item, index) => {
    const name = names[index]!;
    const shared = keys.filter((key) => key === keys[index]).length > 1;
    spans.set(item, name.join("").length < 2 || shared ? [] : occurrences(words, name));
  });
  return spans;
}

/** A name's words without the marks around them ("Old search." is named by "Old search"). */
function trimmed(name: readonly string[]): string[] {
  const isWord = (word: string): boolean => /^[\p{L}\p{N}]/u.test(word);
  const first = name.findIndex(isWord);
  if (first < 0) return [];
  return name.slice(first, name.length - [...name].reverse().findIndex(isWord));
}

function occurrences(words: readonly PanelAssistantSpokenWord[], name: readonly string[]): Span[] {
  const found: Span[] = [];
  for (let start = 0; start + name.length <= words.length; start += 1) {
    if (name.every((word, offset) => words[start + offset]!.word === word)) found.push({ start, end: start + name.length });
  }
  return found;
}

/** The gated class verbs said as commands, by position: unquoted, outside every name, and opening their clause. */
function commandVerbs(words: readonly PanelAssistantSpokenWord[], classes: readonly PanelAssistantGatedClass[], names: readonly Span[]): Map<number, PanelAssistantGatedClass> {
  const commands = new Map<number, PanelAssistantGatedClass>();
  words.forEach(({ word, quoted }, index) => {
    const gated = classes.find((candidate) => PANEL_ASSISTANT_CLASS_VERBS[candidate].includes(word));
    if (gated === undefined || quoted || inside(names, index)) return;
    if (opensClause(words, index)) commands.set(index, gated);
  });
  return commands;
}

function opensClause(words: readonly PanelAssistantSpokenWord[], index: number): boolean {
  for (let before = index - 1; before >= 0; before -= 1) {
    const { word, boundary } = words[before]!;
    if (boundary || WORDS.clause.has(word)) return true;
    if (!WORDS.lead.has(word)) return false;
  }
  return true;
}

/** Whether a whole name of `item` is a gated command's object, and nothing after it moves the act elsewhere. */
function named(reading: Reading, item: PanelAssistantTargetItem): boolean {
  return (reading.spans.get(item) ?? []).some((span) => governed(reading, span.start) && !movedElsewhere(reading.words, span.end));
}

/** Whether "this", "these" or "selected" is a gated command's object and points at `item` in the selection. */
function pointedAt(reading: Reading, item: PanelAssistantTargetItem, context: PanelAssistantContext): boolean {
  return reading.words.some(({ word, quoted }, index) => {
    if (quoted || !WORDS.deictic.has(word) || inside(reading.names, index) || !governed(reading, index)) return false;
    const next = reading.words[index + 1]?.word;
    const kind = next !== undefined && WORDS.kinds.has(next) ? next : undefined;
    if (movedElsewhere(reading.words, kind === undefined ? index + 1 : index + 2)) return false;
    return panelAssistantSelected(item, context, kind);
  });
}

/** Walks back from an object to the command that governs it, over small words, kind words and other named items. */
function governed(reading: Reading, start: number): boolean {
  let index = start - 1;
  while (index >= 0) {
    if (reading.commands.has(index)) return true;
    const span = reading.names.find((candidate) => candidate.end === index + 1);
    const word = reading.words[index]!.word;
    if (span) index = span.start - 1;
    else if (WORDS.filler.has(word) || WORDS.kinds.has(word)) index -= 1;
    else return false;
  }
  return false;
}

/** Whether a word after `end`, up to the end of its clause, makes the act about somewhere else. */
function movedElsewhere(words: readonly PanelAssistantSpokenWord[], end: number): boolean {
  for (let index = end; index < words.length && !words[index]!.boundary; index += 1) {
    if (WORDS.elsewhere.has(words[index]!.word)) return true;
  }
  return false;
}

function inside(spans: readonly Span[], index: number): boolean {
  return spans.some((span) => index >= span.start && index < span.end);
}
