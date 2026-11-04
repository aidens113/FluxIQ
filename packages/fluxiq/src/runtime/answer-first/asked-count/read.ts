// How many times the person's request asks for one act, read from the request's own words
// (plan D6, D14; loop-detection report, item 2). "Add three of this" must reach its result, and
// a lasting act is otherwise never repeated, so this one reading is what lifts that refusal.
//
// **Only the request is read.** Nothing a model wrote comes here: not a reason, a summary, a
// claimed act or a parameter. Every count found is then held to the request word for word by
// verification's own check (`../../result-verification/request-rows/request-wording.ts`, `says`).
//
// **The bias is one-sided.** A count missed leaves the act at one, where a task finds another
// control or a typed quantity; a count invented presses something twice for nobody. So only
// closed forms are read:
//
//   - **A quantity Core's act reader already gives** (`requires`, `choice: "quantity"`): "add two
//     packs of the towels to my cart", "order 3 of ...".
//   - **The same words with no place named**, after add or put first in their clause: "add three
//     of this". The reader asks for a place there, which is how it tells an act from a sentence
//     about one, and this has already held the words to being first in their clause; so it is
//     handed the clause with a place named, and its own reading of a count comes back, with its
//     exclusions: a measure, a price, a rating, a time, a count of different things.
//   - **"N times", "twice", "thrice"**, in a clause that tells someone to do something: "renew
//     the card three times". Not one that describes ("the book listed three times"), reads ("list
//     it three times"), compares ("three times the price") or is negated.
//
// Digits up to three places and the number words two to twelve are read. **Any other form, "a
// dozen", "a couple", "another two", "3x", a count in another language, stays at one.** A count
// over every member of a set is one per row, so it gives no count here.

import { automationStudioInstructedActs, type AutomationStudioInstructedAct } from "../../flow-authoring/bootstrap/instructed-acts/index.ts";
import type { AutomationStudioRunResultSummary } from "../../result-verification/contracts/index.ts";
import { automationStudioRequestWording } from "../../result-verification/request-rows/index.ts";

/** One count the request asks for. */
export type AutomationStudioAnswerFirstAskedCount = {
  count: number;
  /** The request's own words that ask for it. */
  quote: string;
  /** The act Core read it for, where Core read one. */
  act?: string;
};

const NUMBER_WORDS: Readonly<Record<string, number>> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twice: 2, thrice: 3 };
const NUMBER = "two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[0-9]{1,3}";
const EDGE = "[\\p{L}\\p{N}'’-]";
const TIMES = new RegExp(`(?<!${EDGE})(?<count>${NUMBER})\\s+times(?!${EDGE})(?!\\s+(?:the|a|an|as|more|less|per|each|every|over|larger|bigger|smaller|higher|lower)(?!${EDGE}))`, "giu");
const WORD_TIMES = new RegExp(`(?<!${EDGE})(?<count>twice|thrice)(?!${EDGE})(?!\\s+(?:the|as|a|an|per|each|every)(?!${EDGE}))`, "giu");

/** What only joins a clause to the one before it. */
const CLAUSE_BREAK = /,|:|\s(?:and|then)\s/giu;
const LEADING = /^(?:\s*(?:then|and|please|also|first|next|finally|now|just)\s)+/iu;
const PLACELESS_VERB = /^\s*(?:add|put)(?=\s)/iu;
/** Where the act reader looks for a place, on words that name none. */
const A_PLACE = " to my basket";
/** A clause that reads or looks is asking for nothing to be done again. */
const READ_VERB = /^\s*(?:list|find|show|read|tell|give|get|look|search|check|see|count|open|view|visit|note|report|return)(?![\p{L}])/iu;
const DESCRIBES = /(?<![\p{L}])(?:that|which|who|whose|where|when|if|was|were|is|are|been|has|have|had|listed|shown|appears?|seen)(?![\p{L}])/iu;
const NEGATED = /(?<![\p{L}])(?:not|don't|dont|never|without|nor|no)(?![\p{L}])/iu;
const SENTENCE_END = /[.;!?](?=\s|$)|\n/u;

/** A result with no rows: the request's words are all that is asked of it here. */
const NOTHING_READ: AutomationStudioRunResultSummary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false };

/** Every count the request asks for (header). */
export function automationStudioAnswerFirstAskedCounts(request: string): AutomationStudioAnswerFirstAskedCount[] {
  const wording = automationStudioRequestWording([{ title: "", body: request }], NOTHING_READ);
  if (!wording) return [];
  const acts = automationStudioInstructedActs(request);
  const found: AutomationStudioAnswerFirstAskedCount[] = acts.flatMap((act) => act.plural ? [] : quantitiesOf(act).map((quantity) => ({ ...quantity, act: act.id })));
  for (const said of [...timesOf(request), ...placelessCountsOf(request)]) {
    const act = acts.find((each) => folded(each.quote).includes(folded(said.quote)));
    if (act?.plural) continue;
    found.push({ ...said, ...(act ? { act: act.id } : {}) });
  }
  return unique(found.filter((each) => each.count >= 2 && wording.says(each.quote)));
}

function quantitiesOf(act: AutomationStudioInstructedAct): AutomationStudioAnswerFirstAskedCount[] {
  return (act.requires ?? []).filter((choice) => choice.choice === "quantity").flatMap((choice) => {
    const count = countOf(choice.value);
    return count === undefined ? [] : [{ count, quote: choice.quote }];
  });
}

/** "N times", "twice" and "thrice", in a clause that tells someone to do something. */
function timesOf(request: string): AutomationStudioAnswerFirstAskedCount[] {
  const found: AutomationStudioAnswerFirstAskedCount[] = [];
  for (const sentence of request.split(SENTENCE_END)) {
    for (const match of [...sentence.matchAll(TIMES), ...sentence.matchAll(WORD_TIMES)]) {
      const clause = clauseBefore(sentence, match.index);
      if (!clause.trim() || DESCRIBES.test(clause) || NEGATED.test(clause) || READ_VERB.test(clause)) continue;
      const count = countOf(match.groups?.count ?? "");
      if (count !== undefined) found.push({ count, quote: `${clause.trim()} ${match[0]}`.replace(/\s+/gu, " ") });
    }
  }
  return found;
}

/** A count first in what follows add or put, first in its clause, where the words name no place. */
function placelessCountsOf(request: string): AutomationStudioAnswerFirstAskedCount[] {
  const found: AutomationStudioAnswerFirstAskedCount[] = [];
  for (const sentence of request.split(SENTENCE_END)) {
    for (const clause of sentence.split(CLAUSE_BREAK)) {
      const bare = clause.replace(LEADING, "").trimEnd();
      if (!PLACELESS_VERB.test(bare) || NEGATED.test(lastWordsBefore(sentence, clause))) continue;
      const [act] = automationStudioInstructedActs(`${bare}${A_PLACE}`);
      if (act && !act.plural) found.push(...quantitiesOf(act).map((quantity) => ({ ...quantity, quote: quantity.quote.replace(A_PLACE, "") })));
    }
  }
  return found;
}

function countOf(value: string): number | undefined {
  const written = value.trim().toLowerCase();
  return /^[0-9]{1,3}$/u.test(written) ? Number(written) : NUMBER_WORDS[written];
}

/** The three words before a clause in its sentence, where a negation of it would stand. */
function lastWordsBefore(sentence: string, clause: string): string {
  return sentence.slice(0, sentence.indexOf(clause)).trim().split(/\s+/u).slice(-3).join(" ");
}

/** The words of the sentence's last clause before `at`. */
function clauseBefore(sentence: string, at: number): string {
  const before = sentence.slice(0, at);
  let start = 0;
  for (const join of before.matchAll(CLAUSE_BREAK)) start = join.index + join[0].length;
  return before.slice(start).replace(LEADING, "");
}

function unique(counts: readonly AutomationStudioAnswerFirstAskedCount[]): AutomationStudioAnswerFirstAskedCount[] {
  const kept = new Map<string, AutomationStudioAnswerFirstAskedCount>();
  for (const each of counts) {
    const key = `${each.act ?? ""}\n${each.count}`;
    if (!kept.has(key)) kept.set(key, each);
  }
  return [...kept.values()];
}

function folded(text: string): string {
  return text.replace(/\s+/gu, " ").trim().toLowerCase();
}
