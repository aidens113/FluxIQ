import { automationStudioActivityHumanLabel } from "./human-label.ts";

type Verb = { word: RegExp; plain: string; named?: (name: string) => string; also?: { word: RegExp; plain: string } };

const quoted = (name: string): string => `“${name}”`;

/**
 * What a node or tool does, told by the verbs in its id. The first word of the
 * id's last segment that is one of these decides ("web.output.dom-click" is
 * `dom`, `click`: a click). Generic verbs only -- no domain's id is written
 * here -- so a node registered later is named by the same words.
 */
const VERBS: readonly Verb[] = [
  { word: /^(navigate|goto|visit|open|load)$/u, plain: "Opening a page" },
  { word: /^back$/u, plain: "Going back a page" },
  { word: /^(click|press|tap)$/u, plain: "Clicking on the page", named: (name) => `Clicking ${quoted(name)}` },
  { word: /^(type|fill|enter)$/u, plain: "Typing into the page", named: (name) => `Typing into ${quoted(name)}` },
  { word: /^clear$/u, plain: "Clearing a field", named: (name) => `Clearing ${quoted(name)}` },
  { word: /^(select|choose)$/u, plain: "Choosing an option", named: (name) => `Choosing an option in ${quoted(name)}` },
  { word: /^check$/u, plain: "Ticking a box", named: (name) => `Ticking ${quoted(name)}` },
  { word: /^upload$/u, plain: "Adding a file", named: (name) => `Adding a file to ${quoted(name)}` },
  { word: /^(extract|read|collect|scrape)$/u, plain: "Reading from the page", also: { word: /^(list|rows|records|items)$/u, plain: "Reading the list" } },
  { word: /^detect$/u, plain: "Looking for something on the page", also: { word: /^(repeating|list|structure)$/u, plain: "Looking for the list of items" } },
  { word: /^(capture|snapshot|inspect|look|observe)$/u, plain: "Looking at the page" },
  { word: /^scroll$/u, plain: "Scrolling the page" },
  { word: /^wait$/u, plain: "Waiting for the page" },
  { word: /^assert$/u, plain: "Checking the page" },
  { word: /^download$/u, plain: "Downloading a file" },
  { word: /^(keypress|key)$/u, plain: "Pressing a key" },
  { word: /^dialog$/u, plain: "Answering a dialog" },
  { word: /^tab$/u, plain: "Switching tabs" }
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
    const verb = VERBS.find((candidate) => candidate.word.test(word));
    if (!verb) continue;
    if (verb.also && words.slice(index + 1).some((rest) => verb.also!.word.test(rest))) return verb.also.plain;
    const name = verb.named ? elementName(input.parameters) : undefined;
    return name && verb.named ? verb.named(name) : verb.plain;
  }
  return undefined;
}
