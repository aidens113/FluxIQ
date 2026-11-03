import { automationStudioActivityFailureCodeWords, automationStudioActivityReasonText } from "../wording/index.ts";

// A builder's return, said to the person (t649).
//
// The dispatcher writes a return's reason for the supervisor
// (`../../project-agents/dispatch/ending.ts`, `dispatcher.ts`): its failure's
// code, the calls it stopped on and their answers, a predecessor's brief by
// its id and subflow by its key. The return card carried that text, and the
// person read "The builder failed: Flow Bootstrap generation failed
// (flow_bootstrap.evidence_repeat_without_progress). It was stopped by
// llm_evidence_loop.repeat_refused" and "Brief brief-1 for subflow
// switch_store, which this subflow starts after, ended blocked (...)" (A8
// frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00008). The supervisor
// still reads the return as it was written (the build record and the dispatch
// tool's answer); only the card is said here:
//
// - a part that never started because the one it starts after did not pass
//   names that part: "It starts after <name>, which couldn't be built, so it
//   was never started";
// - a builder its loop stopped says why from its failure's code, in the words
//   the chat's ending uses (`../wording/failure-code-words.ts`): "The builder
//   couldn't finish: it kept trying without getting any further, so it was
//   stopped";
// - the builder's own ending keeps its words, screened as any reason the model
//   gives is (`../wording/reason-text.ts`): "The builder stopped: ...";
// - any other sentence is kept only when it names no code, call, key or brief
//   id; and with nothing left, the outcome alone in words.

/** The dispatcher's sentence for a brief that waited on another of its dispatch that did not pass. */
const AFTER_BRIEF = /^Brief \S+ for subflow (\S+), which this subflow starts after, (ended (?:blocked|partial|done))\b/u;
/** The dispatcher's sentence for a brief whose predecessor is in no dispatch and never passed. */
const AFTER_ABSENT = /^Subflow (\S+), which this subflow starts after, is not in this dispatch\b/u;
/** The dispatcher's other sentences for a brief that never started, by their opening. */
const NOT_STARTED: ReadonlyArray<readonly [RegExp, string]> = [
  [/^This brief and another of the same dispatch each wait for the other's subflow\b/u, "It and another part each start after the other, so neither could start."],
  [/^The build was stopped before this brief's turn came\b/u, "The build was stopped before its turn came."],
  [/^The build record could not be written for this brief\b/u, "FluxIQ could not record this part's work, so it was never started."]
];
/** The dispatcher's opening for a builder its loop stopped, with the failure's code in brackets. */
const BUILDER_FAILED = /^The builder failed: Flow Bootstrap generation failed \(([^()\s]+)\)\.?\s*/u;
/** The dispatcher's opening for the builder's own ending. */
const BUILDER_ENDED = /^The builder ended this brief (blocked|partial):\s*/u;

/** How the brief a part waited on came back, said of that part. */
const AFTER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  "ended blocked": "couldn't be built",
  "ended partial": "was only partly built",
  "ended done": "came back without a version that passed its test"
});
/** A return with nothing left to say once its codes and ids are out, by its outcome. */
const OUTCOME_WORDS: Readonly<Record<"done" | "partial" | "blocked", string>> = Object.freeze({
  done: "The builder finished this part.",
  partial: "The builder finished only part of this part.",
  blocked: "The builder couldn't finish this part."
});

/** A dotted id ("core.submit_subflow", "web.handle.unknown"): every part at least two characters, so "e.g." is none. */
const DOTTED_ID = /\b[a-z][\w-]+(?:\.[\w-]{2,})+\b/iu;
/** A code or key written with underscores ("repeat_refused"). */
const SNAKE = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/iu;
/** A brief's id as the supervisor numbers them ("brief-1"). */
const BRIEF_ID = /\bbrief-\d+\b/iu;
/** Where one sentence ends and the next begins. */
const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-Z“"])/u;
/** The most of the builder's own words the card keeps. */
const MAX_OWN_WORDS = 200;

/**
 * `returned`'s reason in a person's words. `nameOf` says a subflow by its key
 * as the plan names it. Never empty, never a code, a call, a key or an id.
 */
export function automationStudioProjectReturnWords(returned: { outcome: "done" | "partial" | "blocked"; reason: string }, nameOf: (subflowKey: string) => string): string {
  const text = returned.reason.replace(/\s+/gu, " ").trim();
  const named = (key: string): string => {
    const name = nameOf(key);
    return name === key && SNAKE.test(key) ? `“${key.replace(/_+/gu, " ")}”` : name;
  };
  const after = AFTER_BRIEF.exec(text);
  if (after) return `It starts after ${named(after[1]!)}, which ${AFTER_WORDS[after[2]!]}, so it was never started.`;
  const absent = AFTER_ABSENT.exec(text);
  if (absent) return `It starts after ${named(absent[1]!)}, which hasn't passed its test yet, so it was never started.`;
  const unstarted = NOT_STARTED.find(([pattern]) => pattern.test(text));
  if (unstarted) return unstarted[1];
  const failed = BUILDER_FAILED.exec(text);
  const opening = failed ? `The builder couldn't finish: ${automationStudioActivityFailureCodeWords(failed[1]!) ?? "it stopped before this part was built"}.` : undefined;
  const rest = failed ? text.slice(failed[0].length) : text;
  const ended = BUILDER_ENDED.exec(rest);
  const body = ended ? rest.slice(ended[0].length) : rest;
  // Each sentence that names no code, call, key or brief id, then screened as any reason the model gives is.
  const kept = body.split(SENTENCE_END).filter((sentence) => sentence.trim() && !DOTTED_ID.test(sentence) && !SNAKE.test(sentence) && !BRIEF_ID.test(sentence));
  const words = kept.length ? automationStudioActivityReasonText(kept.join(" "), MAX_OWN_WORDS) : undefined;
  const lead = ended && words ? `${ended[1] === "partial" ? "The builder stopped partway" : "The builder stopped"}: ${words}` : words;
  const said = [opening, lead].filter((sentence): sentence is string => sentence !== undefined).join(" ").trim();
  return said || OUTCOME_WORDS[returned.outcome];
}
