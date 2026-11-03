// A no's reasons, and whether an answer asked again may take its place (t686).
//
// **Why.** A8 cost round `run-mvblov2i-abb7d82e`, judge 0044: over a revision
// that stored rows the request leaves out, a no said so -- the stored rows
// include named rows the end view marks as the kind the request leaves out --
// and, in another sentence, called a step before the read "redundant but not
// harmful". Core read that sentence as blaming the step (it held "excludes" and
// "drops"), asked the call again with a recheck about such steps only (t666),
// and the yes it gave took the no's place; the other no went the same way, and
// two yeses passed a wrong Flow. That re-ask's header promised a no blaming
// "only" such steps; its code checked that each step it found was one, never
// that the no gave no other reason.
//
// **The rule, for every re-ask whose answer can take a no's place**: a no Core's
// record wholly refutes (t607) and a split's no adding an exclusion the request
// never states (t515), both `./reask-contradicted.ts`; and a no blaming steps
// that chose the request's words (t666, `../unsure-doubts/narrowing-no-reask.ts`).
// A no's `observed` and `advice` (its `expected` restates the request) are cut
// into the reasons they state: each sentence, less Core's own wording of the
// conditions it names (`../refuted-no/condition-wording.ts`), and within one at
// ";", ", but", ", yet", ", however", ", while", "whereas" and ", and", outside
// quotes and brackets. A part is no reason where it calls something harmless,
// redundant, correct, or matching the request (`APPROVES`), nor is the part
// before it where it opens with ", and" and speaks of that part ("them", "so");
// in `observed`, nor
// where it says nothing is wrong (`FAULT`) and names nothing (`namesNothing`:
// no quote, no capitalised name past its first word, no condition by number,
// no node id, no row Core holds) -- "read kept 12 rows across 2 pages". A part
// naming a row is a reason even in neutral words: "the stored rows include
// Bluebird Quartet Live, marked Promoted". In `advice` any other part asks for
// a change, and is a reason, but for one that only keeps something. The call
// may be asked again only where every reason is settled:
//
// - it is the kind the recheck addresses (the caller's `addressed`);
// - or Core's record refutes it: its sentence, weighed alone with the advice,
//   is wholly refuted (`../refuted-no/weigh.ts`); and a reason naming nothing
//   Core can name ("stored only two rows") rests on those beside it where the
//   record wholly refutes the reading as a whole, as `weigh.ts` reads it --
//   never on a recheck's kind alone, which settles only what it names;
// - or, in `advice`, it rests on settled reasons: every text it quotes and
//   every name it capitalises is in an `observed` reason that is settled.
//   Advice is the change a no's observations ask for (`../refuted-no/weigh.ts`
//   reads it so); a name only the advice gives is a reason of its own.
//
// Otherwise the no stands: its call is not asked again. Core never turns a no
// into a yes; this only decides whether a call may be asked once more.

import type { AutomationStudioResultRepairDirective } from "../contracts/index.ts";
import {
  automationStudioResultReadingSentences, automationStudioResultRefutedReading, automationStudioResultSentenceRows, automationStudioResultWithoutConditionWording, type AutomationStudioResultNoRecord
} from "../refuted-no/index.ts";

/** A reading of a no, as its directive carries it. */
type Reading = NonNullable<AutomationStudioResultRepairDirective["judgement"]>;

/** What settles a no's reasons for one re-ask (header). */
export type AutomationStudioResultNoReasonSettles = {
  /** Whether a reason is the kind the recheck of this re-ask addresses. */
  addressed: (reason: string) => boolean;
  /** Core's record of the judged result; absent, no reason is refuted by it. */
  record?: AutomationStudioResultNoRecord | undefined;
};

/** Words that say something is wrong, or ask for a change. Generic, never any site's. */
const FAULT = /\b(?:not|no|never|none|nothing|missing|absent|wrong(?:ly)?|incorrect(?:ly)?|fail(?:s|ed|ing)?|instead|should|must|lack(?:s|ing)?|without|exclud\w*|duplicat\w*|twice|extra|too\s+(?:many|few)|only|fewer|less|problem\w*|errors?|mistak\w*|narrow\w*|restrict\w*|limit(?:s|ed|ing)?|drop(?:s|ped|ping)?|remov\w*|replac\w*|los(?:e|es|t|ing)|beyond|unread|unrequested|unspecified)\b|n['’]t\b/iu;

/**
 * Words calling something harmless, redundant, correct, or matching the request,
 * where no "not", "never" or "n't" stands just before them. Generic, never any site's.
 */
const APPROVES = new RegExp(String.raw`(?<!\b(?:not|never)\s+(?:\w+\s+)?)(?<!n['’]t\s+(?:\w+\s+)?)(?:\b(?:harmless|not\s+harmful|no\s+harm|correctly|rightly|properly|appropriately|no\s+change\s+(?:is\s+)?needed|nothing\s+to\s+change)\b`
  + String.raw`|\b(?:is|are|was|were|seems?|looks?|remains?)\s+(?:(?!not\b|never\b)\w+\s+)?(?:correct|right|fine|valid|accurate|appropriate|harmless|redundant)\b`
  + String.raw`|\bmatch(?:es|ed|ing)?\s+(?:\w+\s+){0,2}?(?:request|instructions?|task|query)\b)`, "iu");

/** An advice part that only keeps something, without narrowing to it. */
const KEEPS = /^(?:(?:and|also|but|then)\s+)?keep(?:s|ing)?\b(?!\s+only\b)/iu;

/** Where a sentence is cut into the reasons it states (header), outside quotes and brackets. */
const CUT = /^(?:;|,\s+(?:but|yet|however|while|and)\s|\s+whereas\s|\s+however,\s)/iu;

/** A quoted text: double or curly quotes, or single quotes not inside a word. */
const QUOTED = /"([^"]+)"|“([^”]+)”|(?<![\p{L}\p{N}])'([^']+?)'(?![\p{L}\p{N}])/gu;

/** A capitalised word: a name the advice gives. */
const CAPITALISED = /(?<![\p{L}\p{N}])\p{Lu}[\p{L}\p{N}'’-]*/gu;

/**
 * Whether every reason a no states is settled (header), and the reasons the
 * recheck addresses. A no stating none is settled: each re-ask still asks only
 * on its own ground.
 */
export function automationStudioResultNoReasonsSettled(reading: Reading | undefined, settles: AutomationStudioResultNoReasonSettles): { settled: boolean; addressed: string[] } {
  const addressed: string[] = [];
  const settledReasons: string[] = [];
  let settled = true;
  const advice = reading?.advice ? { advice: reading.advice } : {};
  // Whether Core's record wholly refutes the reading as a whole: then a reason naming nothing rests on those beside it, as `../refuted-no/weigh.ts` reads it.
  let whole: boolean | undefined;
  for (const sentence of automationStudioResultReadingSentences(reading?.observed)) {
    let refuted: boolean | undefined;
    for (const part of statedReasons(automationStudioResultWithoutConditionWording(sentence))) {
      if (!FAULT.test(part) && !namesARow(part, settles.record)) continue;
      if (settles.addressed(part)) addressed.push(part);
      else if (!(refuted ??= refutedAlone({ observed: sentence, ...advice }, settles.record))
        && !(namesNothing(part, settles.record) && (whole ??= refutedAlone({ observed: reading?.observed ?? "", ...advice }, settles.record)))) {
        settled = false;
        continue;
      }
      settledReasons.push(part);
    }
  }
  for (const sentence of automationStudioResultReadingSentences(reading?.advice)) {
    let refuted: boolean | undefined;
    for (const part of statedReasons(automationStudioResultWithoutConditionWording(sentence))) {
      if (KEEPS.test(part)) continue;
      if (settles.addressed(part)) addressed.push(part);
      else if (!restsOn(part, settledReasons, settles.record) && !(refuted ??= refutedAlone({ advice: sentence }, settles.record))) settled = false;
    }
  }
  return { settled, addressed };
}

/** Words by which a part speaks of the one before it. */
const REFERS_BACK = /\b(?:them|it|its|this|that|these|those|so)\b/iu;

/**
 * The reasons a sentence states (header): its parts, less each calling
 * something harmless, redundant, correct or matching (`APPROVES`), and less
 * the part before one that does so joined to it by ", and" and speaking of it
 * ("..., and condition 2 then drops them, so the filter is redundant").
 */
function statedReasons(sentence: string): string[] {
  const parts = reasonParts(sentence);
  const dropped = new Set<number>();
  parts.forEach((part, index) => {
    if (!APPROVES.test(part.text)) return;
    dropped.add(index);
    if (part.joined && index > 0 && REFERS_BACK.test(part.text)) dropped.add(index - 1);
  });
  return parts.filter((_, index) => !dropped.has(index)).map((part) => part.text);
}

/** A sentence cut into its parts (header), each trimmed; `joined` where ", and" opened it. */
function reasonParts(sentence: string): Array<{ text: string; joined: boolean }> {
  const parts: Array<{ text: string; joined: boolean }> = [];
  let from = 0;
  let joined = false;
  let quoted = false;
  let depth = 0;
  for (let at = 0; at < sentence.length; at += 1) {
    const char = sentence[at]!;
    if (char === "\"") quoted = !quoted;
    else if (char === "“") quoted = true;
    else if (char === "”") quoted = false;
    else if (char === "(" || char === "[") depth += 1;
    else if ((char === ")" || char === "]") && depth > 0) depth -= 1;
    if (quoted || depth > 0) continue;
    const cut = CUT.exec(sentence.slice(at));
    if (!cut) continue;
    parts.push({ text: sentence.slice(from, at), joined });
    joined = /^,\s+and\s/iu.test(cut[0]);
    // The word that cut it stays with the part it opens ("but ...", "however ..."); the comma and semicolon do not.
    from = at + (cut[0].startsWith(";") ? 1 : cut[0].search(/[^,\s]/u));
    at = from - 1;
  }
  parts.push({ text: sentence.slice(from), joined });
  return parts.map((part) => ({ ...part, text: part.text.trim() })).filter((part) => part.text);
}

/** The texts a part quotes. */
function quotes(part: string): string[] {
  return [...part.matchAll(QUOTED)].map((match) => (match[1] ?? match[2] ?? match[3] ?? "").trim()).filter(Boolean);
}

/** Whether a part names a row Core's record holds, stored or left out. */
function namesRow(part: string, record: AutomationStudioResultNoRecord | undefined): boolean {
  if (!record) return false;
  const named = automationStudioResultSentenceRows(part, record);
  return named.stored.length > 0 || named.leftOut.length > 0;
}

/** A condition, by the number Core names it with. */
const CONDITION_NUMBER = /\bcondition\s+\d+\b/iu;

/**
 * Whether a part names a row, in whatever words: it quotes something, gives a
 * capitalised name past its first word, or names a row the record holds. A
 * part naming only a condition, in neutral words, is no reason of its own, as
 * `../refuted-no/weigh.ts` reads it (t631).
 */
function namesARow(part: string, record: AutomationStudioResultNoRecord | undefined): boolean {
  const unquoted = part.replace(QUOTED, " ");
  const first = unquoted.search(/\S/u);
  return quotes(part).length > 0 || namesRow(part, record) || [...unquoted.matchAll(CAPITALISED)].some((match) => match.index !== first);
}

/**
 * Whether a part names nothing Core can name: no row (`namesARow`), no
 * condition by number and no step by node id -- "stored only two rows".
 */
function namesNothing(part: string, record: AutomationStudioResultNoRecord | undefined): boolean {
  return !namesARow(part, record) && !CONDITION_NUMBER.test(part) && !(record?.nodeIds ?? []).some((nodeId) => part.includes(nodeId));
}

/** Whether Core's record wholly refutes a reading weighed alone (`../refuted-no/weigh.ts`); never without the record. */
function refutedAlone(reading: Reading, record: AutomationStudioResultNoRecord | undefined): boolean {
  return record ? automationStudioResultRefutedReading(reading, record).wholly : false;
}

/**
 * Whether an advice part rests on settled reasons (header): every text it
 * quotes, but a quote of the request, and every name it capitalises past its
 * first word, is in one of them.
 */
function restsOn(part: string, settled: readonly string[], record: AutomationStudioResultNoRecord | undefined): boolean {
  const unquoted = part.replace(QUOTED, " ");
  const names = [
    ...quotes(part).filter((text) => !record?.says?.(text)),
    ...[...unquoted.matchAll(CAPITALISED)].filter((match) => match.index !== unquoted.search(/\S/u)).map((match) => match[0])
  ];
  const within = settled.map(fold);
  return names.every((name) => within.some((reason) => wholeWords(reason, fold(name))));
}

function fold(text: string): string {
  return text.toLowerCase().replace(/[“”]/gu, "\"").replace(/\s+/gu, " ").trim();
}

/** Whether `words` run in `text` as words of their own. */
function wholeWords(text: string, words: string): boolean {
  if (!words) return true;
  const at = ` ${text} `;
  return new RegExp(`[^\\p{L}\\p{N}]${words.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}[^\\p{L}\\p{N}]`, "u").test(at);
}
