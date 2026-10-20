// A judge's advice that repeats what this builder was already told (t741 D).
//
// Social rerun round 3 (`run-mvgoawg4-ed85dd5a`, 0128, 0144, 0145, 0217, 0218):
// after each judged no the judges advised the same change, the builder made it,
// and the trial that followed failed the way the one before had; the next no
// advised it again, and the builder swung back. Handing the same paragraph
// over again told the builder nothing it did not have, and hid the one thing
// it did not: what happened the last time it followed that advice.
//
// So a builder's test tool keeps, for its own loop, each trial it ran in order:
// its revision, its verdict, what stopped it when it did not run to its end
// (`stoppedBy.said`, the gate's own sentence, `../candidate/trial-stop.ts`), and
// the sentences of a judged no's advice. A later judged no's advice is read
// sentence by sentence; a sentence that is the same as one this builder was
// given after an earlier trial is left out of `advice`, and `adviceRepeated`
// says, in Core's words, that the judge repeated it and what the trial that
// followed that earlier advice answered. A sentence that is new stays where it
// was, under its judge call. Nothing else in the answer changes, and every
// answer that is not a judged no -- an unsure's reading, a refusal, a yes -- is
// passed on as it came.
//
// **The same sentence.** Two sentences are the same when they say the same
// numbers and share at least four in five of their words, read without case,
// punctuation, small joining words or step ids (a step's id changes with every
// submission). A judge's part that carries Core's label (`Judge call N (...)`,
// `../../result-verification/agreement/refuted-labelled.ts`) carries Core's
// findings with it and is passed on whole. Advice is only ever left out where
// it was said before: nothing here decides that advice is wrong.
//
// Generic words only: no site's, task's or list's terms.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** Where each judge call's part of an advice starts, as the agreement writes it. */
const CALL_PART = /Judge call [12](?: \(|: )/gu;
/** One part's own prefix, when it carries no label. */
const PLAIN_PREFIX = /^Judge call [12]: /u;
/** Where one sentence ends and the next begins. */
const SENTENCE_END = /(?<=[.!?])\s+(?=["'(\[\p{Lu}])/u;
/** A step's id: three or more dotted parts. */
const STEP_ID = /[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+){2,}/gu;
/** Small joining words that carry no advice of their own. Negations are kept. */
const JOINING = new Set(["a", "an", "the", "to", "of", "and", "or", "in", "on", "at", "by", "for", "from", "with", "into", "its", "it", "that", "this", "these", "those", "is", "are", "be", "as", "so", "each", "then", "than"]);
/** The share of their words two sentences must have in common to be the same advice (header). */
const SAME_WORDS = 0.8;
/** The fewest words a sentence must have to be compared at all. */
const FEWEST_WORDS = 3;
/** The most characters of a stop's own sentence the note repeats. */
const MAX_STOPPED = 300;
/** The most earlier trials one note names. */
const MAX_NAMED = 3;

type Sentence = { text: string; words: ReadonlySet<string>; numbers: string };
type Part = { prefix: string; sentences: Sentence[] } | { whole: string };
type Trial = { revision: number; verdict: string; stopped?: string | undefined; sentences: readonly Sentence[] };

/** One builder's memory of the advice its trials were given, and the answer its test tool passes on (header). */
export class AutomationStudioSubflowRepeatedAdvice {
  private readonly trials: Trial[] = [];

  /** The test tool's answer as the builder is shown it: a judged no's advice less what an earlier trial's advice already said, with a note in its place. Remembers every trial. */
  told<T extends { evidence: JsonValue }>(answered: T): T {
    const evidence = answered.evidence;
    if (!isObject(evidence) || evidence.partial !== true || typeof evidence.revision !== "number" || typeof evidence.verdict !== "string") return answered;
    const feedback = isObject(evidence.feedback) ? evidence.feedback : {};
    const judge = evidence.verdict === "no" && isObject(feedback.judge) ? feedback.judge : undefined;
    const parts = typeof judge?.advice === "string" ? partsOf(judge.advice) : [];
    const index = this.trials.length;
    this.trials.push({ revision: evidence.revision, verdict: evidence.verdict, stopped: stoppedSaid(feedback), sentences: parts.flatMap((part) => ("sentences" in part ? part.sentences : [])) });
    if (!judge || !parts.length) return answered;
    // Each repeated sentence, by the latest earlier trial whose advice said it.
    const repeated = new Map<number, number>();
    const kept = parts.map((part): Part => {
      if (!("sentences" in part)) return part;
      return { prefix: part.prefix, sentences: part.sentences.filter((sentence) => {
        const earlier = this.saidBefore(sentence, index);
        if (earlier !== undefined) repeated.set(earlier, (repeated.get(earlier) ?? 0) + 1);
        return earlier === undefined;
      }) };
    });
    if (!repeated.size) return answered;
    const rest = kept.map((part) => ("whole" in part ? part.whole : part.sentences.length ? `${part.prefix}${part.sentences.map((sentence) => sentence.text).join(" ")}` : "")).filter(Boolean).join(" ");
    const { advice: _advice, ...others } = judge;
    const told: JsonObject = { ...others, ...(rest ? { advice: rest } : {}), adviceRepeated: this.note(repeated, index) };
    return { ...answered, evidence: { ...evidence, feedback: { ...feedback, judge: told } } } as T;
  }

  /** The latest trial before `index` whose advice said the same sentence; undefined when none did. */
  private saidBefore(sentence: Sentence, index: number): number | undefined {
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      if (this.trials[earlier]!.sentences.some((said) => same(said, sentence))) return earlier;
    }
    return undefined;
  }

  /** Core's words for the repeated sentences: whose advice they were, and what the trial after that advice answered (header). */
  private note(repeated: ReadonlyMap<number, number>, index: number): string {
    const named = [...repeated.entries()].sort(([a], [b]) => a - b).slice(-MAX_NAMED);
    const lines = named.map(([earlier, count]) => {
      const gave = `The judge repeated ${count === 1 ? "a sentence" : `${count} sentences`} of the advice it gave after the trial of revision ${this.trials[earlier]!.revision}, which ${count === 1 ? "is" : "are"} left out of advice.`;
      const next = this.trials[earlier + 1]!;
      if (earlier + 1 === index) return `${gave} This trial, of revision ${next.revision}, is the next trial after that advice, and it was judged no again.`;
      return `${gave} The trial that followed that advice, of revision ${next.revision}, answered ${answeredWords(next)}`;
    });
    return `${lines.join(" ")} Weigh the repeated advice against what ${named.length === 1 ? "that trial" : "those trials"} answered before following it again.`;
  }
}

/** What a trial answered, in a clause that ends its sentence. */
function answeredWords(trial: Trial): string {
  if (trial.verdict === "execution_failed" && trial.stopped) return `execution_failed: ${trial.stopped}`;
  return `${trial.verdict}.`;
}

/** The sentence the gate wrote for what stopped a trial, bounded at a word's end; undefined when it wrote none. */
function stoppedSaid(feedback: JsonObject): string | undefined {
  const stop = isObject(feedback.stoppedBy) ? feedback.stoppedBy : undefined;
  const said = typeof stop?.said === "string" ? stop.said.trim() : "";
  if (!said) return undefined;
  if (said.length <= MAX_STOPPED) return /[.!?]$/u.test(said) ? said : `${said}.`;
  const cut = said.slice(0, MAX_STOPPED);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}...`;
}

/** An advice's parts, one per judge call, each split into its sentences; a labelled part whole (header). */
function partsOf(advice: string): Part[] {
  const starts = [...advice.matchAll(CALL_PART)].map((match) => match.index!);
  const pieces = (starts.length ? [advice.slice(0, starts[0]), ...starts.map((at, index) => advice.slice(at, starts[index + 1]))] : [advice]).map((piece) => piece.trim()).filter(Boolean);
  return pieces.map((piece): Part => {
    if (piece.startsWith("Judge call") && !PLAIN_PREFIX.test(piece)) return { whole: piece };
    const prefix = PLAIN_PREFIX.exec(piece)?.[0] ?? "";
    return { prefix, sentences: piece.slice(prefix.length).split(SENTENCE_END).map((text) => text.trim()).filter(Boolean).map(sentenceOf) };
  });
}

/** A sentence with the words and numbers it is compared by (header). */
function sentenceOf(text: string): Sentence {
  const tokens = text.toLowerCase().replace(STEP_ID, " step ").split(/[^\p{L}\p{N}]+/u).filter((token) => token.length > 1 || /\p{N}/u.test(token));
  const numbers = tokens.filter((token) => /\p{N}/u.test(token)).sort().join(" ");
  const words = new Set(tokens.filter((token) => !JOINING.has(token)).map(stem));
  return { text, words, numbers };
}

/** A word without a plural's closing s, so a field and its fields read alike. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** Whether two sentences are the same advice (header). */
function same(a: Sentence, b: Sentence): boolean {
  if (a.numbers !== b.numbers || a.words.size < FEWEST_WORDS || b.words.size < FEWEST_WORDS) return false;
  let shared = 0;
  for (const word of a.words) {
    if (b.words.has(word)) shared += 1;
  }
  return shared / (a.words.size + b.words.size - shared) >= SAME_WORDS;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
