import { activityActionVerb, type ActivityActionVerb } from "../../../../../ui/index.ts";
import { automationStudioActivityHumanLabel } from "./human-label.ts";

type Phrase = { verb: ActivityActionVerb; plain: string; named?: (name: string) => string; also?: { word: RegExp; plain: string } };

const quoted = (name: string): string => `“${name}”`;

/**
 * What a node or tool does, told by the verbs in its id. The first word of the
 * id's last segment that names a verb decides ("web.output.dom-click" is
 * `dom`, `click`: a click). Which words name which verb is written once, in
 * the chat's action kinds (`ui/activity-action/verb.ts`), so the card's icon
 * and this sentence always agree; this table says each verb in a person's
 * words. A verb with no sentence here (`search`, `list`) is passed over, as an
 * unknown word is. Each sentence opens with the verb's "-ing" word in that
 * table, which is how a card reads the verb back from a title.
 */
const PHRASES: readonly Phrase[] = [
  { verb: "navigate", plain: "Opening a page" },
  { verb: "back", plain: "Going back a page" },
  { verb: "click", plain: "Clicking on the page", named: (name) => `Clicking ${quoted(name)}` },
  { verb: "type", plain: "Typing into the page", named: (name) => `Typing into ${quoted(name)}` },
  { verb: "clear", plain: "Clearing a field", named: (name) => `Clearing ${quoted(name)}` },
  { verb: "select", plain: "Choosing an option", named: (name) => `Choosing an option in ${quoted(name)}` },
  { verb: "check", plain: "Ticking a box", named: (name) => `Ticking ${quoted(name)}` },
  { verb: "upload", plain: "Adding a file", named: (name) => `Adding a file to ${quoted(name)}` },
  { verb: "read", plain: "Reading from the page", also: { word: /^(list|rows|records|items)$/u, plain: "Reading the list" } },
  { verb: "detect", plain: "Looking for something on the page", also: { word: /^(repeating|list|structure)$/u, plain: "Looking for the list of items" } },
  { verb: "look", plain: "Looking at the page" },
  { verb: "scroll", plain: "Scrolling the page" },
  { verb: "wait", plain: "Waiting for the page" },
  { verb: "assert", plain: "Checking the page" },
  { verb: "download", plain: "Downloading a file" },
  { verb: "key", plain: "Pressing a key" },
  { verb: "dialog", plain: "Answering a dialog" },
  { verb: "tab", plain: "Switching tabs" }
];

/**
 * The accessible name of the element a step acts on, when the step already
 * carries it: the element identity a resolved node keeps (`element`), which is
 * part of the Flow the person owns. Never a value typed, read or observed.
 */
function elementName(parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const element = (parameters as { element?: unknown }).element;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  return automationStudioActivityHumanLabel((element as { accessibleName?: unknown }).accessibleName, 60);
}

/**
 * What a step does, in a person's words: its authored label when it has one
 * ("Open search"), else the verb its id names with the element's name when the
 * step carries one ("Clicking “Get a free quote”"), else the verb alone
 * ("Opening a page"). Nothing when the id names no known verb, so the caller
 * says something plain of its own rather than the id.
 */
export function automationStudioActivityAction(input: { id?: string | undefined; parameters?: unknown; label?: string | undefined }): string | undefined {
  const label = automationStudioActivityHumanLabel(input.label, 120);
  if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  if (typeof input.id !== "string") return undefined;
  const words = (input.id.split(".").at(-1) ?? "").toLowerCase().split(/[-_\s]+/u).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const named = activityActionVerb(word)?.verb;
    const verb = named ? PHRASES.find((candidate) => candidate.verb === named) : undefined;
    if (!verb) continue;
    if (verb.also && words.slice(index + 1).some((rest) => verb.also!.word.test(rest))) return verb.also.plain;
    const name = verb.named ? elementName(input.parameters) : undefined;
    return name && verb.named ? verb.named(name) : verb.plain;
  }
  return undefined;
}
