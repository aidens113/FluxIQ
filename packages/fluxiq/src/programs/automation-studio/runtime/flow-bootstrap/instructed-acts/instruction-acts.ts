// The lasting acts an instruction asks for, read from the person's own words.
//
// **Read here, not by a model, for the reason `../answerability/instruction-ask.ts`
// gives.** A build must not spend a call to be told what its own instruction
// says, and the instructed consequences (`../../action-permissions/instructed.ts`)
// answer a different question -- which classes of consequence are authorised --
// in classes too coarse to name the act: "set the radius" and "open saved items"
// are no consequence class at all.
//
// **The bias is one-sided, deliberately.** A missed act leaves a build exactly
// where every build stood before this existed; a false one refuses a Flow for
// something nobody asked, and costs a whole build. So an act is read only where
// the words are unambiguous, and two rules carry most of that:
//
//   - **The verb must be in command position**: the start of a sentence, or
//     after a comma, a colon, `then`, `and`, `please`, `also`. That is what tells
//     "Order one pack" from "in the order the results show them", "Buy one new
//     kettle" from "Auctions that also offer Buy it now count", and "Save the
//     three cheapest" from "move the phone case to Save for later".
//   - **A negation just before it drops it**: "and do not check out", "Do not
//     buy anything", "don't send any other message".
//
// **Each act quotes its own clause, and a verb over several counted objects is
// one act per object.** Run 6 (`run-muncqlr0-3348202b`) asked to "add two
// packs of the ... Paper Towels ... and one pack of the ... Dinner Napkins ...
// to my cart"; read as one `add` quoting the whole sentence, it let a Flow that
// added only the towels pass, and showed the model one quote for two acts. So:
//
//   - An act's quote runs from its verb to the next act's verb in the sentence
//     (or the sentence's end), joining words and trailing punctuation trimmed.
//   - An `add_to` or `save` whose objects are joined by "and", each beginning
//     with a count ("two packs", "one pack", "a", "an", digits), all before the
//     place they go ("to my cart"), is one act per object, each quoting its
//     verb, its own object and that place. Only counted objects split, so "the
//     kettle and the toaster" stays one act, and coordinated verbs over one
//     object ("Collect and use that store's coupon") stay one act as before.
//
// **An act over a whole set is marked.** "Confirm everyone I have at least
// five mutual friends with" asks for one act per qualifying request, and Lane
// D's run 2 (`run-munnop9n-5475d593`) answered it with one Confirm. Where a
// closed quantifier -- every, everyone, everybody, everything, all, each --
// stands among the first words of a saving, adding, claiming, moving or
// submitting act, the act is `plural` (`EVERY` says what it must not follow or
// precede), and `./check.ts` wants a step the Flow repeats for it.
//
// **Checking out is the order it pays for.** "Order one pack ... Check out as
// a guest ..." asks for one transaction, and read as two submits it wanted two
// steps for one press of Place order (pickup audit #5, `run-muny5y17-a927214b`).
// So a check-out act after an order, buy or purchase in the same instruction is
// not read again; a check-out asked alone is still an act.
//
// **An act carries the class its verb names** (`./act-consequence.ts`), so the
// check can hold the steps that do it to declaring it.
//
// Every pattern was checked against the forty-odd instructions of the ten
// realistic sites (`apps/scenario-lab/src/scenarios/*/live-tasks.ts` in the web
// repository): each consequential task yields its acts, and no extraction task
// yields any. The tests pin both directions.
import { automationStudioInstructedActImpliedConsequence } from "./act-consequence.ts";
import type { AutomationStudioInstructedAct, AutomationStudioInstructedActKind } from "./contracts.ts";
import { automationStudioInstructedChoices } from "./instruction-choices.ts";

/** Words that may stand before a verb in command position. */
const LEADING_WORDS: ReadonlySet<string> = new Set(["then", "and", "please", "also", "first", "next", "finally", "now", "just"]);
const NEGATION = /(?<![A-Za-z])(?:not|don't|dont|never|without|nor|no)(?![A-Za-z])/iu;

const PLACE = "(?:saved\\s+items|saved\\s+jobs|saved\\s+posts|saved\\s+searches|saved|watch\\s*list|wish\\s*list|cart|basket|bag|trolley|orders|order\\s+history|inbox|collections?|favou?rites|bookmarks)";

/** Where an added or saved thing goes: "to my cart", "in the basket", "onto my saved jobs". */
const DESTINATION = new RegExp(`(?<![A-Za-z])(?:to|in|into|onto|on)\\s+(?:my|the|your|our)\\s+(?:[A-Za-z'-]+\\s+){0,2}?${PLACE}(?![A-Za-z])`, "iu");

/** A count that begins a coordinated object: "two packs", "one pack", "a", "an", "3". Not "a few", "a half". */
const COUNT = "(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)\\s+(?!(?:half|quarter|few|bit|lot|little|while|moment)(?![A-Za-z]))[A-Za-z0-9]";
const COUNTED_OBJECT = new RegExp(`^\\s+${COUNT}`, "iu");
const OBJECT_JOIN = new RegExp(`(?:,\\s*|\\s+)and\\s+(?=${COUNT})`, "giu");

/**
 * An act asked for every member of a set: "confirm everyone ...", "withdraw
 * every connection request ...", "add to my watchlist every auction ...". The
 * quantifier must stand within the first four words after the verb, where it
 * governs the act's own object; later it qualifies something else ("within
 * five miles of every station"). Not after a price ("at $30 each"), not before
 * a count ("all three kettles", which separate steps may do), and not inside a
 * name ("All-Purpose").
 */
const EVERY = /^(?:\s+\S+){0,3}?\s+(?<![0-9£$€¥¢]\S*\s+)(?:every(?:one|body|thing)?|all|each)(?![A-Za-z0-9'-])(?!\s+(?:both|two|three|four|five|six|seven|eight|nine|ten|\d+)(?![A-Za-z0-9]))/iu;

/**
 * The kinds an act over a whole set can be. Opening a place shows all of it
 * at once, and a setting ("sort all results") is made once, so neither is.
 */
const PLURAL_KINDS: ReadonlySet<AutomationStudioInstructedActKind> = new Set(["save", "add_to", "claim", "move", "submit"]);

/**
 * The acts whose item may carry a quantity or a variant (`./instruction-choices.ts`):
 * putting it somewhere, or buying it. Saving it, or submitting anything else, chooses nothing.
 */
const CHOOSING_BUYS = /^(?:buy|purchase|order)$/u;

/** A check-out, which after one of `CHOOSING_BUYS` is that same transaction. */
const CHECKING_OUT = /^check\s*out$/u;
const choosesItem = (kind: AutomationStudioInstructedActKind, verb: string): boolean => kind === "add_to" || (kind === "submit" && CHOOSING_BUYS.test(verb));

/** What only joins a quote to the next act, trimmed from its end. */
const TRAILING = /(?:[\s,;:(&"“—-]+|\s+(?:then|and|also|please|first|next|finally|now|just))+$/iu;

/**
 * One way an act is asked for: a verb, optionally what must follow it in the
 * same sentence (`after`, tested against the rest of the sentence), and
 * optionally what must not (`unless`, tested against the verb as written and
 * the rest of the sentence).
 */
type ActPattern = { kind: AutomationStudioInstructedActKind; verb: RegExp; after?: RegExp; unless?: RegExp };

/**
 * Asking for the automation itself: "Create a deterministic Start to End
 * Flow", "create an automation that ...". That is the instruction to FluxIQ,
 * not a lasting act on the target, and read as one it refuses every Flow for
 * a step no target could hold (t196's note: the service fixtures' instruction
 * read as a `create`). Only `create` over the automation's
 * own names, within the first seven words, so "Create a collection in my saved
 * posts" stays an act.
 */
const THE_AUTOMATION_ITSELF = /^create(?:\s+\S+){0,6}?\s+(?:flows?|subflows?|automations?|workflows?)(?![A-Za-z])/iu;

const word = (alternatives: string): RegExp => new RegExp(`(?<![A-Za-z'-])(?:${alternatives})(?![A-Za-z'-])`, "giu");

const PATTERNS: readonly ActPattern[] = [
  { kind: "save", verb: word("save|bookmark") },
  { kind: "add_to", verb: word("add|put"), after: DESTINATION },
  { kind: "claim", verb: word("collect|claim|clip|redeem|use"), after: /^(?:\s+\S+){0,6}?\s+(?:coupons?|vouchers?|promo(?:tion)?(?:\s+codes?)?|discount(?:\s+codes?)?)(?![A-Za-z])/iu },
  { kind: "set", verb: word("switch|change|set"), after: /^(?:\s+\S+){0,4}?\s+(?:store|location|radius|address|region|country|currency|language|filters?|sort|distance)(?![A-Za-z])/iu },
  { kind: "set", verb: word("narrow|filter|sort"), after: /^(?:\s+\S+){0,2}?\s+(?:results?|search|list|listings?|them|by)(?![A-Za-z])/iu },
  { kind: "move", verb: word("move"), after: /(?<![A-Za-z])to(?![A-Za-z])/iu },
  { kind: "open", verb: word("open|view|visit"), after: new RegExp(`^\\s+(?:up\\s+)?(?:my|the)\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "open", verb: word("go"), after: new RegExp(`^\\s+to\\s+(?:my|the)\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "open", verb: word("give|list|show|tell"), after: new RegExp(`^\\s+(?:me\\s+)?(?:\\S+\\s+){0,4}?(?:everything|what\\s+is|what's|whatever\\s+is|all)\\s+(?:that\\s+is\\s+|is\\s+)?(?:already\\s+|now\\s+)?(?:in|on)\\s+my\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "submit", verb: word("book|buy|purchase|order|send|post|publish|create|confirm|withdraw|submit|reserve"), unless: THE_AUTOMATION_ITSELF },
  { kind: "submit", verb: word("place"), after: /^\s+(?:a|an|my|the)\s+(?:[A-Za-z-]+\s+){0,2}?(?:bid|order|offer)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("check\\s*out|checkout") },
  { kind: "submit", verb: word("ask"), after: /(?<![A-Za-z])for\s+(?:a|an)\s+(?:[A-Za-z-]+\s+){0,2}?(?:quote|estimate|call-?back)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("request"), after: /^\s+(?:a|an)\s+(?:[A-Za-z-]+\s+){0,2}?(?:quote|estimate|call-?back)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("apply"), after: /^\s+(?:for|to)(?![A-Za-z])/iu }
];

/** The lasting acts the instruction asks for, in the order it asks. Nothing here calls a provider. */
export function automationStudioInstructedActs(instructionText: string): AutomationStudioInstructedAct[] {
  const text = typeof instructionText === "string" ? instructionText : "";
  // `object` is the act's own words after its verb, which its choices are read from.
  const found: Array<Omit<AutomationStudioInstructedAct, "id" | "requires"> & { at: number; object: string }> = [];
  for (const { sentence, start } of sentences(text)) {
    const matched: Array<{ kind: AutomationStudioInstructedActKind; index: number; written: string }> = [];
    for (const pattern of PATTERNS) {
      pattern.verb.lastIndex = 0;
      for (let match = pattern.verb.exec(sentence); match; match = pattern.verb.exec(sentence)) {
        const rest = sentence.slice(match.index + match[0].length);
        if (!commandPosition(sentence, match.index) || negated(sentence, match.index)) continue;
        if (pattern.after && !pattern.after.test(rest)) continue;
        if (pattern.unless?.test(match[0] + rest)) continue;
        // One act of a kind per sentence: "Collect and use that store's coupon"
        // is one act asked for twice, not two.
        if (matched.some((act) => act.kind === pattern.kind)) continue;
        matched.push({ kind: pattern.kind, index: match.index, written: match[0] });
      }
    }
    matched.sort((left, right) => left.index - right.index);
    matched.forEach((act, order) => {
      // The act's own clause: its verb up to the next act's verb, or the sentence's end.
      const rest = sentence.slice(act.index + act.written.length, matched[order + 1]?.index ?? sentence.length);
      const verb = act.written.replace(/\s+/gu, " ").toLowerCase();
      const plural = PLURAL_KINDS.has(act.kind) && EVERY.test(rest) ? { plural: true as const } : {};
      const objects = act.kind === "add_to" || act.kind === "save" ? coordinatedObjects(rest) : undefined;
      if (!objects) {
        found.push({ kind: act.kind, verb, quote: quoted(act.written + rest), at: start + act.index, object: rest, ...plural });
        return;
      }
      for (const object of objects) found.push({ kind: act.kind, verb, quote: quoted(`${act.written} ${object.quote}`), at: start + act.index + object.offset, object: ` ${object.quote}`, ...plural });
    });
  }
  // A build reads its instruction as its title, a newline, then its body
  // (`service.ts`), and a title restates the task: "Save cheap tables" above
  // "Save the three cheapest dining tables ..." is one save, not two, and a
  // second one could never be given a step of its own. So an act read from the
  // first line gives way to the body asking for the same kind -- the bias this
  // file keeps, towards an act missed rather than one invented.
  const titleEnd = text.indexOf(String.fromCharCode(10));
  const body = titleEnd >= 0 && text.slice(titleEnd + 1).trim() ? found.filter((act) => act.at > titleEnd) : [];
  const read = found
    .filter((act) => !(titleEnd >= 0 && act.at < titleEnd && body.some((other) => other.kind === act.kind)))
    .sort((left, right) => left.at - right.at);
  return read
    .filter((act) => !(act.kind === "submit" && CHECKING_OUT.test(act.verb) && read.some((other) => other.at < act.at && other.kind === "submit" && CHOOSING_BUYS.test(other.verb))))
    .map((act, index) => {
      const id = `a${index + 1}`;
      const requires = choosesItem(act.kind, act.verb) ? automationStudioInstructedChoices(id, act.object) : [];
      const consequence = automationStudioInstructedActImpliedConsequence(act.verb);
      return { id, kind: act.kind, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: act.plural } : {}), ...(requires.length ? { requires } : {}), ...(consequence ? { consequence } : {}) };
    });
}

/**
 * The objects of one verb, when there are several and each is unambiguous:
 * every one begins with a count, they are joined by "and", and all of them
 * stand before the place they go. Each quotes its own object and that place.
 * Anything less certain is one act, as before.
 */
function coordinatedObjects(rest: string): Array<{ quote: string; offset: number }> | undefined {
  if (!COUNTED_OBJECT.test(rest)) return undefined;
  const destination = DESTINATION.exec(rest);
  if (!destination) return undefined;
  const place = rest.slice(destination.index).trim();
  const bounds: Array<{ from: number; to: number }> = [];
  let from = 0;
  OBJECT_JOIN.lastIndex = 0;
  for (let join = OBJECT_JOIN.exec(rest); join && join.index < destination.index; join = OBJECT_JOIN.exec(rest)) {
    bounds.push({ from, to: join.index });
    from = join.index + join[0].length;
  }
  if (bounds.length === 0) return undefined;
  bounds.push({ from, to: destination.index });
  return bounds.map((bound) => ({ quote: `${rest.slice(bound.from, bound.to).trim()} ${place}`, offset: bound.from }));
}

/** A quote in the person's words, whole: whitespace folded, and what only joins it to the next act trimmed. */
function quoted(quote: string): string {
  return quote.replace(/\s+/gu, " ").trim().replace(TRAILING, "").trimEnd();
}

/**
 * The instruction's sentences. A full stop ends one only when a space or the
 * end follows it, so "4.5 stars" and "7-in-1" stay whole.
 */
function sentences(text: string): Array<{ sentence: string; start: number }> {
  const found: Array<{ sentence: string; start: number }> = [];
  const boundary = /[.;!?](?=\s|$)|\n/gu;
  let start = 0;
  for (let match = boundary.exec(text); ; match = boundary.exec(text)) {
    const end = match ? match.index : text.length;
    if (text.slice(start, end).trim()) found.push({ sentence: text.slice(start, end), start });
    if (!match) break;
    start = match.index + match[0].length;
  }
  return found;
}

/** Whether a verb at `index` is in command position within its sentence. */
function commandPosition(sentence: string, index: number): boolean {
  const before = sentence.slice(0, index).trimEnd();
  if (!before) return true;
  if (/[,:;(&"“]$/u.test(before)) return true;
  const last = /([A-Za-z']+)$/u.exec(before)?.[1]?.toLowerCase();
  return last !== undefined && LEADING_WORDS.has(last);
}

/** Whether one of the three words before `index` negates it. */
function negated(sentence: string, index: number): boolean {
  return NEGATION.test(sentence.slice(0, index).trim().split(/\s+/u).slice(-3).join(" "));
}
