// What an act is done to, in the person's own words: "ValueRidge Everyday
// Dinner Napkins" of "add one pack of the ValueRidge Everyday Dinner Napkins in
// the 250 Count size to my cart".
//
// Read from the act's own quote (`./instruction-acts.ts` bounds it to the act's
// clause, or to its own counted object), less what is not the thing itself:
// the verb; each variant the instruction attaches to the item ("in the 250
// Count size", `./instruction-choices.ts`); where it goes ("to my cart"); what
// follows a relative or joining word ("that is already ...", ", and leave
// ...") or says who sells, ships or posted it ("sold by Voltbay Official
// Store", which a coupon of that store's would otherwise share with the hub);
// a second verb joined to the act's own ("Collect and use"); and the count or
// article that opens it ("one pack of the", "two of the"). A quantity's own quote is left in: it holds the first word of the
// thing counted ("two Tidewell"), and the opening count is cut instead. What is
// left is how the person names the object, and its words are what a step's
// own record is held to (`./object-binding.ts`).
//
// An act of opening has no object here: what it names is a place the Flow
// reads ("my saved items"), and the page that shows it shows the other acts'
// objects too, so holding it, or holding another act to it, could only refuse.
//
// The bias is the reader's: one-sided. An object read short leaves the binding
// with nothing to hold a step to, which is where every step stood before.

import type { AutomationStudioInstructedAct } from "./contracts.ts";

/** The object of an act: the person's words for it, and the words a step's record may be held to. */
export type AutomationStudioInstructedActObject = { name: string; words: string[] };

/** Where an added or saved thing goes, which ends its object: "to my cart", "in my saved jobs". */
const DESTINATION = /\s(?:to|in|into|onto|on)\s+(?:my|your|our)\s/iu;

/** A relative or joining word after which the words describe the object rather than name it, or name something else. */
const CLAUSE_END = /(?:,\s*and\s|\s(?:that|which|who|whose|so|while|without|with|where|when|because|then)\s|\s(?:sold|shipped|delivered|offered|listed|posted|made)\s+(?:by|from|on|in)\s)/iu;

/** A second verb joined to the act's own: "and use" of "Collect and use that store's coupon". */
const JOINED_VERB = /^(?:and|or)\s+[A-Za-z]+\s+/iu;

/** A count or article that opens an object, with the unit it counts: "one pack of the", "two of the", "the three", "a". */
const OPENING = /^(?:(?:a|an|the|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[0-9]{1,3}|every|each|all)\s+){0,2}(?:(?:packs?|boxes|box|bags?|bottles?|cans?|pieces?|units?|sets?|pairs?|items?|of)\s+)*(?:the\s+)?/iu;

/** The shortest word that can name a thing. */
const MIN_WORD = 3;

/**
 * Words that never tell one object from another, as `automationStudioInstructedObjectWords`
 * folds them: articles, pronouns, prepositions, quantifiers, and the generic
 * units, places and choices an object is counted, put or chosen in.
 */
const NOT_NAMING: ReadonlySet<string> = new Set([
  "the", "and", "for", "with", "from", "that", "thi", "these", "those", "which", "who", "whose", "what", "than", "then", "also", "only", "just",
  "not", "nor", "both", "while", "when", "where", "there", "here", "into", "onto", "over", "under", "about", "after", "before", "within", "without",
  "all", "every", "each", "everyone", "everybody", "everything", "any", "some", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "more", "less", "most", "least", "very", "same", "other", "another",
  "you", "your", "our", "their", "its", "his", "her", "them", "they", "are", "was", "were", "has", "have", "had", "been", "being", "will", "can",
  "pack", "box", "boxe", "bag", "bottle", "piece", "unit", "set", "pair", "item", "cart", "basket", "trolley", "list", "saved", "size", "count",
  "colour", "color", "version", "quantity"
]);

/** The object of an act, or nothing when its quote names none apart from its verb and its choices, or it is an act of opening. */
export function automationStudioInstructedActObject(act: AutomationStudioInstructedAct): AutomationStudioInstructedActObject | undefined {
  if (act.kind === "open") return undefined;
  let rest = act.quote.replace(/\s+/gu, " ").trim();
  const verb = new RegExp(`^${act.verb.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s*")}(?![A-Za-z])`, "iu");
  rest = rest.replace(verb, "").trim().replace(JOINED_VERB, "");
  for (const choice of act.requires ?? []) {
    if (choice.choice !== "variant") continue;
    const at = rest.indexOf(choice.quote);
    if (at >= 0) rest = `${rest.slice(0, at)} ${rest.slice(at + choice.quote.length)}`;
  }
  for (const end of [DESTINATION, CLAUSE_END]) {
    const found = end.exec(rest);
    if (found) rest = rest.slice(0, found.index);
  }
  const name = rest.replace(/\s+/gu, " ").trim().replace(OPENING, "").replace(/(?:\s*[,;:.(&"“—-])+(?=\s|$)/gu, "").replace(/\s+/gu, " ").trim();
  const words = automationStudioInstructedObjectWords(name).filter((word) => !NOT_NAMING.has(word));
  return name && words.length ? { name, words: [...new Set(words)] } : undefined;
}

/**
 * The words of any text, as an object and a step's record are both compared:
 * lowercased, split at everything that is not a letter or a digit, only those
 * of three characters or more that hold a letter, and a plural's final "s"
 * dropped ("towels" and "Towel" are one word). "Select-A-Size" is `select`,
 * `size`; a product page's address is the words of its slug.
 */
export function automationStudioInstructedObjectWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => word.length >= MIN_WORD && /\p{L}/u.test(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}
