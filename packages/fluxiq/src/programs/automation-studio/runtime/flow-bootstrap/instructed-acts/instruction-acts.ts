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
// Every pattern was checked against the forty-odd instructions of the ten
// realistic sites (`apps/scenario-lab/src/scenarios/*/live-tasks.ts` in the web
// repository): each consequential task yields its acts, and no extraction task
// yields any. The tests pin both directions.
import type { AutomationStudioInstructedAct, AutomationStudioInstructedActKind } from "./contracts.ts";

const MAX_ACTS = 8;
const MAX_QUOTE = 200;

/** Words that may stand before a verb in command position. */
const LEADING_WORDS: ReadonlySet<string> = new Set(["then", "and", "please", "also", "first", "next", "finally", "now", "just"]);
const NEGATION = /(?<![A-Za-z])(?:not|don't|dont|never|without|nor|no)(?![A-Za-z])/iu;

const PLACE = "(?:saved\\s+items|saved\\s+jobs|saved\\s+posts|saved\\s+searches|saved|watch\\s*list|wish\\s*list|cart|basket|bag|trolley|orders|order\\s+history|inbox|collections?|favou?rites|bookmarks)";

/**
 * One way an act is asked for: a verb, and optionally what must follow it in
 * the same sentence (`after`, tested against the rest of the sentence).
 */
type ActPattern = { kind: AutomationStudioInstructedActKind; verb: RegExp; after?: RegExp };

const word = (alternatives: string): RegExp => new RegExp(`(?<![A-Za-z'-])(?:${alternatives})(?![A-Za-z'-])`, "giu");

const PATTERNS: readonly ActPattern[] = [
  { kind: "save", verb: word("save|bookmark") },
  { kind: "add_to", verb: word("add|put"), after: new RegExp(`(?<![A-Za-z])(?:to|in|into|onto|on)\\s+(?:my|the|your|our)\\s+(?:[A-Za-z'-]+\\s+){0,2}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "claim", verb: word("collect|claim|clip|redeem|use"), after: /^(?:\s+\S+){0,6}?\s+(?:coupons?|vouchers?|promo(?:tion)?(?:\s+codes?)?|discount(?:\s+codes?)?)(?![A-Za-z])/iu },
  { kind: "set", verb: word("switch|change|set"), after: /^(?:\s+\S+){0,4}?\s+(?:store|location|radius|address|region|country|currency|language|filters?|sort|distance)(?![A-Za-z])/iu },
  { kind: "set", verb: word("narrow|filter|sort"), after: /^(?:\s+\S+){0,2}?\s+(?:results?|search|list|listings?|them|by)(?![A-Za-z])/iu },
  { kind: "move", verb: word("move"), after: /(?<![A-Za-z])to(?![A-Za-z])/iu },
  { kind: "open", verb: word("open|view|visit"), after: new RegExp(`^\\s+(?:up\\s+)?(?:my|the)\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "open", verb: word("go"), after: new RegExp(`^\\s+to\\s+(?:my|the)\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "open", verb: word("give|list|show|tell"), after: new RegExp(`^\\s+(?:me\\s+)?(?:\\S+\\s+){0,4}?(?:everything|what\\s+is|what's|whatever\\s+is|all)\\s+(?:that\\s+is\\s+|is\\s+)?(?:already\\s+|now\\s+)?(?:in|on)\\s+my\\s+(?:[A-Za-z'-]+\\s+){0,1}?${PLACE}(?![A-Za-z])`, "iu") },
  { kind: "submit", verb: word("book|buy|purchase|order|send|post|publish|create|confirm|withdraw|submit|reserve") },
  { kind: "submit", verb: word("place"), after: /^\s+(?:a|an|my|the)\s+(?:[A-Za-z-]+\s+){0,2}?(?:bid|order|offer)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("check\\s*out|checkout") },
  { kind: "submit", verb: word("ask"), after: /(?<![A-Za-z])for\s+(?:a|an)\s+(?:[A-Za-z-]+\s+){0,2}?(?:quote|estimate|call-?back)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("request"), after: /^\s+(?:a|an)\s+(?:[A-Za-z-]+\s+){0,2}?(?:quote|estimate|call-?back)(?![A-Za-z])/iu },
  { kind: "submit", verb: word("apply"), after: /^\s+(?:for|to)(?![A-Za-z])/iu }
];

/** The lasting acts the instruction asks for, in the order it asks. Nothing here calls a provider. */
export function automationStudioInstructedActs(instructionText: string): AutomationStudioInstructedAct[] {
  const text = typeof instructionText === "string" ? instructionText : "";
  const found: Array<Omit<AutomationStudioInstructedAct, "id"> & { at: number; sentence: number }> = [];
  sentences(text).forEach(({ sentence, start }, sentenceIndex) => {
    for (const pattern of PATTERNS) {
      pattern.verb.lastIndex = 0;
      for (let match = pattern.verb.exec(sentence); match; match = pattern.verb.exec(sentence)) {
        const rest = sentence.slice(match.index + match[0].length);
        if (!commandPosition(sentence, match.index) || negated(sentence, match.index)) continue;
        if (pattern.after && !pattern.after.test(rest)) continue;
        // One act of a kind per sentence: "Collect and use that store's coupon"
        // is one act asked for twice, not two.
        if (found.some((act) => act.sentence === sentenceIndex && act.kind === pattern.kind)) continue;
        found.push({ kind: pattern.kind, verb: match[0].replace(/\s+/gu, " ").toLowerCase(), quote: sentence.replace(/\s+/gu, " ").trim().slice(0, MAX_QUOTE), at: start + match.index, sentence: sentenceIndex });
      }
    }
  });
  // A build reads its instruction as its title, a newline, then its body
  // (`service.ts`), and a title restates the task: "Save cheap tables" above
  // "Save the three cheapest dining tables ..." is one save, not two, and a
  // second one could never be given a step of its own. So an act read from the
  // first line gives way to the body asking for the same kind -- the bias this
  // file keeps, towards an act missed rather than one invented.
  const titleEnd = text.indexOf(String.fromCharCode(10));
  const body = titleEnd >= 0 && text.slice(titleEnd + 1).trim() ? found.filter((act) => act.at > titleEnd) : [];
  return found
    .filter((act) => !(titleEnd >= 0 && act.at < titleEnd && body.some((other) => other.kind === act.kind)))
    .sort((left, right) => left.at - right.at)
    .slice(0, MAX_ACTS)
    .map((act, index) => ({ id: `a${index + 1}`, kind: act.kind, verb: act.verb, quote: act.quote }));
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
