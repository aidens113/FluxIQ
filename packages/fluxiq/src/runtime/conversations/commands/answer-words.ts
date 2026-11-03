// A person's words as the answer to an ask.
//
// "Yes", "go ahead", "no thanks", "the second one", "use the blue kettle": an
// ask is settled by a grant, a refusal, an option or words, and which of those
// a sentence is depends on the ask it answers. A yes-or-no question that gets
// neither a yes nor a no is not guessed at: the answer is null and the thread
// asks again, because granting by mistake is the one reading that cannot be
// taken back.

import type { AutomationStudioConversationAnswerKind, AutomationStudioConversationAsk } from "../ask.ts";
import { automationStudioClosestName, automationStudioNameWords } from "../instructions/index.ts";

export type AutomationStudioConversationWordsAnswer = {
  kind: AutomationStudioConversationAnswerKind;
  value?: string;
};

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|fine|allow|allowed|approve|approved|grant|granted|confirm|confirmed|go ahead|go on|do it|apply|apply it|please do|of course|absolutely|correct|right|y)\b/iu;
const NO = /^(no|nope|nah|don'?t|do not|deny|denied|refuse|reject|cancel|stop|never|not now|leave it|n)\b/iu;
const OPTION_FLOOR = 0.34;
const ORDINALS: Readonly<Record<string, number>> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4, last: -1 };

export function automationStudioConversationAnswerFromWords(ask: AutomationStudioConversationAsk, words: string): AutomationStudioConversationWordsAnswer | null {
  const said = words.trim().replace(/^["'\s]+|["'.!\s]+$/gu, "");
  if (!said) return null;
  if (ask.kind === "open") return { kind: "text", value: words.trim() };
  if (ask.kind === "permission" || ask.kind === "confirm") {
    const yes = YES.test(said);
    const no = NO.test(said);
    if (yes === no) return null;
    return { kind: yes ? "grant" : "deny" };
  }
  const options = ask.options ?? [];
  if (!options.length) return null;
  const exact = options.find((option) => option.id === said || option.label.toLowerCase() === said.toLowerCase());
  if (exact) return { kind: "choice", value: exact.id };
  const ordinal = said.toLowerCase().split(/\s+/u).map((word) => ORDINALS[word]).find((index) => index !== undefined);
  if (ordinal !== undefined) {
    const option = ordinal < 0 ? options[options.length - 1] : options[ordinal];
    if (option) return { kind: "choice", value: option.id };
  }
  const distinct = optionNamedByItsOwnWords(said, options);
  if (distinct) return { kind: "choice", value: distinct };
  const match = automationStudioClosestName(said, options.map((option) => ({ key: option.id, labels: [option.label] })));
  return match && match.confidence >= OPTION_FLOOR ? { kind: "choice", value: match.key } : null;
}

/**
 * The one option whose own words -- those no other option shares -- the
 * person used. "The large one please" names "Large kettle" over "Small
 * kettle" by "large" alone; "kettle" says nothing about which.
 */
function optionNamedByItsOwnWords(said: string, options: NonNullable<AutomationStudioConversationAsk["options"]>): string | null {
  const spoken = new Set(automationStudioNameWords(said));
  const wordsOf = options.map((option) => new Set(automationStudioNameWords(option.label)));
  const hits = options.flatMap((option, index) => {
    const own = [...wordsOf[index]!].filter((word) => wordsOf.every((other, at) => at === index || !other.has(word)));
    return own.some((word) => spoken.has(word)) ? [option.id] : [];
  });
  return hits.length === 1 ? hits[0]! : null;
}
