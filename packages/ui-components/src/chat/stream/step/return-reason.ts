// A builder's return, said under its "Couldn't build ..." card in a person's
// words.
//
// Core hands the project supervisor a builder's reason written for the
// supervisor: its codes, its call ids and the ids of its briefs. The return
// card carried it as it was, and the person read "The builder failed: Flow
// Bootstrap generation failed (flow_bootstrap.evidence_repeat_without_progress).
// It was stopped by llm_evidence_loop.repeat_refused" and "Brief brief-1 for
// subflow switch_store, which this subflow starts after, ended blocked (...)"
// (A8 frozen pair 3, `run-mv9zn5ob-d929084d`, screenshot 00008, t649). Here:
//
// - a part that never started because the part it starts after did not pass
//   says so by that part's name: "It starts after Choose the store, which
//   couldn't be built, so it was never started";
// - a builder Core stopped says why in words, from its ending's code: "The
//   builder kept trying without getting any further, so it was stopped";
// - the builder's own words ("The builder ended this brief blocked: the
//   option is disabled ...") are kept, said as the builder stopping;
// - a part's key is said by its name, a bracket of codes is left out
//   (`withoutRawCodes`), and any sentence still naming a code, an id or a
//   brief is left out whole. Nothing left is no text: the card's heading
//   already says the part couldn't be built.
//
// Pure: no DOM.

import { withoutRawCodes } from "../../format/index.ts";
import type { ProjectNames } from "./project-words.ts";

/** Core's sentence for a brief that waited on another brief of the same dispatch that did not pass. */
const AFTER_BRIEF = /^Brief (\S+) for subflow (\S+), which this subflow starts after, ended (blocked|partial|done)\b/u;
/** Core's sentence for a brief whose predecessor is in no dispatch and never passed. */
const AFTER_ABSENT = /^Subflow (\S+), which this subflow starts after, is not in this dispatch\b/u;
/** Core's opening for a builder its loop stopped, with the ending's code in brackets. */
const BUILDER_FAILED = /^The builder failed: Flow Bootstrap generation failed \(([^()\s]+)\)\.?\s*/u;
/** The builder's own ending, as Core opens it. */
const BUILDER_ENDED = /^The builder ended this brief (blocked|partial):\s*/u;

/** How a predecessor's brief came back, said of its part. */
const AFTER_WORDS: Readonly<Record<string, string>> = { blocked: "couldn't be built", partial: "was only partly built", done: "came back without a version that passed its test" };

/** What stopped a builder, by its ending's code. First match wins. */
const STOPPED: ReadonlyArray<readonly [RegExp, string]> = [
  [/repeat_without_progress$/u, "The builder kept trying without getting any further, so it was stopped."],
  [/unusable_decision$|model_replies_unreadable$|provider_response_malformed$/u, "The builder stopped: the model's answers could not be used."],
  [/provider_unavailable$/u, "The builder stopped: the AI model did not answer."],
  [/evidence_limit$/u, "The builder stopped: it reached the limit on how much it may read from the page."],
  [/tool_failed$/u, "The builder stopped: a step it tried failed in a way it could not go on from."],
  [/cancelled$|aborted$/u, "The builder was stopped."],
  [/timeout|timed_out|deadline/u, "The builder ran out of time."],
  [/cost|spend|budget|exhausted|limit/u, "The builder reached the limit of what it may do."]
];
const STOPPED_OTHERWISE = "The builder stopped before its part was built.";

/** A dotted id ("core.submit_subflow", "web.handle.unknown"): every part at least two characters, so "e.g." is none. */
const DOTTED_ID = /\b[a-z][\w-]+(?:\.[\w-]{2,})+\b/iu;
/** A code or key written with underscores ("switch_store", "repeat_refused"). */
const SNAKE = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/iu;
/** A brief's id as Core numbers them ("brief-1"). */
const BRIEF_ID = /\bbrief-\d+\b/iu;
/** Where one sentence ends and the next begins. */
const SENTENCE_END = /(?<=[.!?…])\s+(?=[A-Z“"])/u;

/** `reason` in a person's words; undefined when nothing of it can be said without a code or an id. */
export function returnReason(reason: string, names: ProjectNames): string | undefined {
  const text = reason.replace(/\s+/gu, " ").trim();
  if (!text) return undefined;
  const after = AFTER_BRIEF.exec(text);
  if (after) {
    const [, briefId, key, outcome] = after;
    return `It starts after ${partName(key!, names, briefId)}, which ${AFTER_WORDS[outcome!]}, so it was never started.`;
  }
  const absent = AFTER_ABSENT.exec(text);
  if (absent) return `It starts after ${partName(absent[1]!, names)}, which hasn't passed its test yet, so it was never started.`;
  const failed = BUILDER_FAILED.exec(text);
  const opening = failed ? stoppedWords(failed[1]!) : undefined;
  const rest = (failed ? text.slice(failed[0].length) : text).replace(BUILDER_ENDED, (_found: string, outcome: string) => (outcome === "partial" ? "The builder stopped partway: " : "The builder stopped: "));
  const kept = withoutRawCodes(namedParts(rest, names)).split(SENTENCE_END).filter((sentence) => sentence.trim() && !DOTTED_ID.test(sentence) && !SNAKE.test(sentence) && !BRIEF_ID.test(sentence));
  const said = [opening, ...kept].filter((sentence): sentence is string => sentence !== undefined).join(" ").trim();
  return said || undefined;
}

/** A part's name by its key: from its brief, else the plan, else the key in words. */
function partName(key: string, names: ProjectNames, briefId?: string): string {
  const named = (briefId === undefined ? undefined : names.briefs.get(briefId)?.subflowName) ?? names.subflows.get(key);
  if (named !== undefined) return named;
  const words = key.replace(/[_-]+/gu, " ").trim();
  return words ? `“${words}”` : "the part before it";
}

/** `text` with each part's key written with underscores said by its name ("switch_store" is "Switch pickup store"). */
function namedParts(text: string, names: ProjectNames): string {
  let said = text;
  for (const [key, name] of names.subflows) {
    if (!key.includes("_")) continue;
    said = said.replace(new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\b`, "gu"), name);
  }
  return said;
}

function stoppedWords(code: string): string {
  return STOPPED.find(([pattern]) => pattern.test(code))?.[1] ?? STOPPED_OTHERWISE;
}
