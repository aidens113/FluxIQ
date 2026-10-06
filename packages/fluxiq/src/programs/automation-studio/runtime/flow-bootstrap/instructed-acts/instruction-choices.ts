// The choices an instruction attaches to the item an act adds or buys: how
// many, and which of its sizes, colours, counts or versions.
//
// **The defect this closes.** Live run 28 (`run-munvvc3z-3eadc185`,
// bigbox-retail) was told to add two packs of the towels in the 12 Double
// Rolls size and one pack of the napkins in the 250 Count size. The act reader
// read both adds and kept "two packs" and "in the ... size" as quote text only,
// so the check asked for one step per add, and a Flow that pressed add to cart
// on each product page as it loaded -- first size, quantity one -- passed and
// missed the goal. Each such choice is now a requirement of its own, of kind
// `set`, linked to its act, and `./check.ts` wants a step of its own for it.
//
// **The bias is the reader's own: one-sided.** A missed choice leaves a build
// where it stood before this existed; an invented one refuses a Flow for a
// choice nobody asked for, and a site may offer no control that makes it. So a
// choice is read only in closed, unambiguous forms, all within the act's own
// object (`./instruction-acts.ts` bounds it):
//
//   - **A quantity** is a count of two or more standing first in the object,
//     before the thing counted ("two packs", "three of the ... hub", "3
//     packs"), or "quantity of N". A count of one, an article ("a", "an"), a
//     price or threshold ("under 50", "£50", "4.5 stars"), a measure ("500 g"),
//     a count of different things ("the three cheapest", "all three", "two
//     different") are none: none of them stands first, or it is excluded here.
//   - **A variant** is "in the <words> size|colour|count|pack|flavour|version
//     ..." ("in the 12 Double Rolls size"), "in size M", "in <words> <colour>"
//     ("in sage green"), or a comma- or colon-separated part of the object
//     that is only a colour or "the <words> version" ("...: Space Grey, the
//     7-in-1 version, ..."). A value that names no particular variant ("the
//     same size", "my usual colour") is none.
//   - **Where it ships from** is "shipped|ships|dispatched from <Place>",
//     the place a proper name ("shipped from Spain", "ships from the UK"),
//     with the id word `origin`. "shipped from the warehouse" names none.
//
// **Why the origin is a choice (lane A, `run-muw60unq-591e23bd`).** Read as
// quote text only, "shipped from Spain" had no id of its own, so the build
// claimed the Spain press for the add itself (a1). The add's press and the
// Spain press then took a1 from each other: each round kept one and dropped
// the other as "no longer doing an act", and the build test only verified
// the Spain press, as an act with a lasting effect, so it never chose Spain.
//
// Only an act that puts an item somewhere or buys it has choices: adding,
// buying, ordering. Saving a thing, or switching a store, chooses nothing.
import type { AutomationStudioInstructedChoice } from "./contracts.ts";

const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({ two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 });
const COUNT = `(?:${Object.keys(NUMBER_WORDS).join("|")}|one|[0-9]{1,3})`;

/** What a count may not be followed by and still be how many of the item: a measure, a price, a rating, a time, or a count of different things. */
const NOT_OF_THE_ITEM = "(?:g|kg|mg|grams?|kilos?|ml|l|litres?|liters?|oz|ounces?|lbs?|pounds?|mm|cm|m|metres?|meters?|km|miles?|inch(?:es)?|in|ft|feet|%|percent|stars?|dollars?|euros?|pence|p|cents?|days?|hours?|minutes?|weeks?|months?|years?|different|separate|distinct|other|kinds?|types?|varieties|or|to|and)";

/** A count first in the object, and the words up to the thing counted: "two packs", "three of the Voltbay". */
const QUANTITY_FIRST = new RegExp(`^\\s*(?<count>${COUNT})(?![A-Za-z0-9.,'-])(?!\\s*${NOT_OF_THE_ITEM}(?![A-Za-z]))(?:\\s*[x×])?(?:\\s+(?:of|the))*\\s+[A-Za-z0-9][A-Za-z0-9'-]*`, "iu");
const QUANTITY_NAMED = new RegExp(`(?<![A-Za-z])(?:a\\s+)?quantity\\s+(?:of\\s+|to\\s+|as\\s+)?(?<count>${COUNT})(?![A-Za-z0-9.,])`, "iu");

const VARIANT_WORD = "size|colou?r|count|pack|flavou?r|scent|style|finish|version|edition|capacity|length|material|pattern";
const COLOUR = "black|white|grey|gray|silver|gold|red|blue|green|yellow|orange|purple|pink|brown|beige|navy|cream|ivory|teal|charcoal|graphite|bronze|copper|khaki|maroon|burgundy|lilac|lavender|mint|olive|turquoise";
const TOKEN = "[A-Za-z0-9][A-Za-z0-9.'/-]*";

/** The ways a variant is named. Each gives the value, and the word the id carries unless it names a colour. */
const VARIANTS: readonly RegExp[] = [
  new RegExp(`(?<![A-Za-z0-9'-])in\\s+(?:the\\s+|a\\s+|an\\s+)?(?<value>(?:${TOKEN}\\s+){0,3}${TOKEN})\\s+(?<word>${VARIANT_WORD})(?![A-Za-z])`, "giu"),
  // Not inside a name: "Select-A-Size Paper Towels" names no size.
  new RegExp(`(?<![A-Za-z0-9'-])(?:in\\s+(?:a\\s+)?)?(?<word>size)\\s+(?<value>[A-Za-z0-9][A-Za-z0-9.'/-]{0,5})(?![A-Za-z0-9'-])`, "giu"),
  new RegExp(`(?<![A-Za-z0-9'-])in\\s+(?<value>(?:[A-Za-z-]+\\s+){0,2}(?:${COLOUR}))(?![A-Za-z-])`, "giu")
];

/** A part of the object that is only a variant: "Space Grey", "the 7-in-1 version". */
const VARIANT_PARTS: readonly RegExp[] = [
  new RegExp(`^\\s*(?:the\\s+)?(?<value>(?:${TOKEN}\\s+){0,2}${TOKEN})\\s+(?<word>${VARIANT_WORD})\\s*$`, "iu"),
  new RegExp(`^\\s*(?<value>(?:[A-Za-z-]+\\s+)?(?:${COLOUR}))\\s*$`, "iu")
];

/** Where the item ships from: a proper name after "shipped|ships|dispatched from" ("shipped from Spain", "ships from the UK"). Case matters: a place is capitalised. */
const ORIGIN = /(?<![A-Za-z0-9'-])(?:[Ss]hipped|[Ss]hips|[Dd]ispatched)\s+[Ff]rom\s+(?:the\s+)?(?<value>[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})(?![A-Za-z0-9'-])/gu;

/** Words that name no particular variant, or join clauses rather than name one. */
const NOT_A_VALUE: ReadonlySet<string> = new Set(["same", "right", "correct", "other", "usual", "default", "current", "that", "this", "any", "whatever", "my", "your", "our", "their", "his", "her", "its", "each", "every", "whole", "entire", "the", "a", "an", "and", "or", "to", "for", "with", "from", "of", "in", "is", "as"]);
const COLOUR_WORD = new RegExp(`^(?:${COLOUR})$`, "iu");

/**
 * The choices of the item an act adds, read from the act's own object (the
 * words after its verb, bounded to its clause or its counted object), in the
 * order a Flow would make them: how many, then each variant as written.
 */
export function automationStudioInstructedChoices(actId: string, object: string): AutomationStudioInstructedChoice[] {
  const choices: Array<AutomationStudioInstructedChoice & { at: number }> = [];
  const quantity = QUANTITY_FIRST.exec(object) ?? QUANTITY_NAMED.exec(object);
  const count = quantity?.groups?.count;
  if (quantity && count && (automationStudioInstructedQuantity(count) ?? 0) >= 2) {
    choices.push({ id: `${actId}.quantity`, kind: "set", of: actId, choice: "quantity", value: count, quote: fold(quantity[0]), at: -1 });
  }
  const variant = (value: string, word: string | undefined, quote: string, at: number): void => {
    const tokens = value.toLowerCase().split(/\s+/u);
    if (tokens.some((token) => NOT_A_VALUE.has(token))) return;
    const named = word ? idWord(word) : tokens.some((token) => COLOUR_WORD.test(token)) ? "colour" : undefined;
    if (!named || choices.some((choice) => choice.id === `${actId}.${named}`)) return;
    choices.push({ id: `${actId}.${named}`, kind: "set", of: actId, choice: "variant", value: fold(value), quote: fold(quote), at });
  };
  const found: Array<{ value: string; word?: string; quote: string; at: number }> = [];
  for (const pattern of VARIANTS) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(object); match; match = pattern.exec(object)) {
      if (match.groups?.value) found.push({ value: match.groups.value, ...(match.groups.word ? { word: match.groups.word } : {}), quote: match[0], at: match.index });
    }
  }
  ORIGIN.lastIndex = 0;
  for (let match = ORIGIN.exec(object); match; match = ORIGIN.exec(object)) {
    if (match.groups?.value) found.push({ value: match.groups.value, word: "origin", quote: match[0], at: match.index });
  }
  let offset = 0;
  for (const part of object.split(/[,:;]/u)) {
    for (const pattern of VARIANT_PARTS) {
      const match = pattern.exec(part);
      if (match?.groups?.value) found.push({ value: match.groups.value, ...(match.groups.word ? { word: match.groups.word } : {}), quote: part, at: offset + match.index });
    }
    offset += part.length + 1;
  }
  for (const each of found.sort((left, right) => left.at - right.at)) variant(each.value, each.word, each.quote, each.at);
  return choices
    .sort((left, right) => left.at - right.at)
    .map(({ at: _at, ...choice }) => choice);
}

/** How many a quantity's written value asks for: `two` is 2, `3` is 3. Undefined for anything else. */
export function automationStudioInstructedQuantity(value: string): number | undefined {
  const written = value.trim().toLowerCase();
  if (/^[0-9]{1,3}$/u.test(written)) return Number(written);
  return written === "one" ? 1 : NUMBER_WORDS[written];
}

/** The id's word for a variant: `colour` for colour or color, `flavour` for either spelling. */
function idWord(word: string): string {
  const lower = word.toLowerCase();
  return lower === "color" ? "colour" : lower === "flavor" ? "flavour" : lower;
}

/** The person's words with whitespace folded, whole (no character cut, user 2026-09-30). */
function fold(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
