import type { ActivityActionKind, ActivityActionVerb } from "./types.ts";

type Entry = { verb: ActivityActionVerb; kind: ActivityActionKind; word: RegExp; gerund: string };

/**
 * The generic verbs an id, a label or a result code can name, the kind each
 * one is, and the "-ing" word the activity wording opens its sentence with
 * ("Clicking “Get a free quote”"). Generic verbs only -- no domain's id is
 * written here -- so a node registered later is read by the same words. The
 * wording (`programs/automation-studio/runtime/activity/wording/action.ts`)
 * recognizes verbs through this table, so each verb is written once.
 */
const VERBS: readonly Entry[] = [
  { verb: "navigate", kind: "navigate", word: /^(navigate|nav|goto|visit|open|load)$/u, gerund: "opening" },
  { verb: "back", kind: "navigate", word: /^back$/u, gerund: "going" },
  // A list's next page (`web.output.dom-next_page`): its step read "Dom next
  // page" on its card and the overlay, the id's words from the first one, as no
  // word of it named a verb (lane C, `run-mv0fuotv-805294d7`). The activity
  // wording has no sentence for it, so its step is named from here: "Next page".
  { verb: "next", kind: "navigate", word: /^next$/u, gerund: "going" },
  { verb: "click", kind: "click", word: /^(click|press|tap)$/u, gerund: "clicking" },
  { verb: "type", kind: "type", word: /^(type|fill|enter)$/u, gerund: "typing" },
  { verb: "search", kind: "type", word: /^search$/u, gerund: "searching" },
  { verb: "clear", kind: "type", word: /^clear$/u, gerund: "clearing" },
  { verb: "select", kind: "click", word: /^(select|choose)$/u, gerund: "choosing" },
  { verb: "check", kind: "click", word: /^check$/u, gerund: "ticking" },
  { verb: "upload", kind: "other", word: /^upload$/u, gerund: "adding" },
  { verb: "read", kind: "read", word: /^(extract|read|collect|scrape)$/u, gerund: "reading" },
  { verb: "list", kind: "read", word: /^list$/u, gerund: "listing" },
  // An element's or a step's whole description (`web.describe_element`), read
  // rather than acted on. After `read`, so a title opening "Reading" still reads
  // back as a read.
  { verb: "describe", kind: "look", word: /^describe$/u, gerund: "reading" },
  { verb: "detect", kind: "look", word: /^detect$/u, gerund: "looking" },
  { verb: "look", kind: "look", word: /^(capture|snapshot|inspect|look|observe|find)$/u, gerund: "looking" },
  { verb: "scroll", kind: "other", word: /^scroll$/u, gerund: "scrolling" },
  { verb: "wait", kind: "wait", word: /^wait$/u, gerund: "waiting" },
  { verb: "assert", kind: "look", word: /^assert$/u, gerund: "checking" },
  { verb: "download", kind: "other", word: /^download$/u, gerund: "downloading" },
  { verb: "key", kind: "type", word: /^(keypress|key)$/u, gerund: "pressing" },
  { verb: "dialog", kind: "click", word: /^dialog$/u, gerund: "answering" },
  { verb: "tab", kind: "navigate", word: /^tab$/u, gerund: "switching" }
];

/**
 * The verb one word names, and its kind. `form: "word"` (the default) reads
 * the word as an id or a label spells it ("click", "fill"); `form: "gerund"`
 * reads it as the first word of the activity wording's sentence ("clicking",
 * "checking"), which is how a title already said in words is read back.
 * Undefined when the word is no known verb.
 */
export function activityActionVerb(word: string, form: "word" | "gerund" = "word"): { verb: ActivityActionVerb; kind: ActivityActionKind } | undefined {
  const lower = word.toLowerCase();
  const entry = VERBS.find((candidate) => form === "word" ? candidate.word.test(lower) : candidate.gerund === lower);
  return entry ? { verb: entry.verb, kind: entry.kind } : undefined;
}
