import { activityActionSentences } from "./sentences.ts";

/** Core's count sentence at the head of a result check's text (`runtime/result-verification/check-words.ts`). */
const TEST_COUNT = /^(?:\d{1,9}|No) rows? would be stored\.$/u;
const RUN_COUNT = /^(?:\d{1,9}|No) rows? came back\.$/u;
/** Rows set out per record set, said for a run that stored more than one. */
const RUN_SETS = /^(?:Rows were stored in \d+ record sets|Rows came back in \d+ record sets|\d+ rows? came back)\b/u;

/**
 * Which result a check card is about, as the card's name: a test's (what a
 * build's candidate Flow would store, so the rows of a repair's round test
 * too) or the run's own rows. A card named only "Check result" above "Run
 * failed" read as the run's verdict when it was a repair's round test (t785,
 * `run-mvskodlp-9966d618`). Undefined when the text carries neither count.
 */
export function activityActionCheckSubject(text: string | undefined): string | undefined {
  const sentences = activityActionSentences(text ?? "");
  if (sentences.some((sentence) => TEST_COUNT.test(sentence))) return "Check of a test's result";
  if (sentences.some((sentence) => RUN_COUNT.test(sentence) || RUN_SETS.test(sentence))) return "Check of the run's result";
  return undefined;
}
