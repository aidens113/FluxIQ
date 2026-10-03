import { activityActionVerb, type ActivityActionVerb } from "../../../../../ui/index.ts";
import { automationStudioActivityHumanLabel } from "./human-label.ts";

type Phrase = {
  verb: ActivityActionVerb;
  plain: string;
  named?: (name: string) => string;
  /** The words the call types or looks for, with the control's name when there is one. */
  said?: (text: string, name: string | undefined) => string;
  /**
   * A second sentence for a word later in the id. `byWords` names it only from
   * the domain's own words for the call, never from an element it carries: a
   * list read's subject is what it reads, not a control.
   */
  also?: { word: RegExp; plain: string; named?: (name: string) => string; byWords?: true };
};

/** What a call names, in words a person reads (`AutomationStudioLlmEvidenceCallWords`): the control, and the words it types or looks for. */
export type AutomationStudioActivityCallWords = { target?: string | undefined; text?: string | undefined };

/** A control's name, in the curly quotes a card reads its target from (`ui/activity-action/action-of.ts`). */
const quoted = (name: string): string => `“${name}”`;
/** Words typed or looked for, in straight quotes, so a card never reads them as the control. */
const said = (text: string): string => `"${text}"`;
/** The most of a typed or searched text a title shows. */
const MAX_SAID = 60;

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
  // "Opening a page" named no page: its card read "Open page" alone (t193,
  // `run-muqiojz4-04a7a8fc`). The page is named by its address path.
  { verb: "navigate", plain: "Opening a page", named: (name) => `Opening ${quoted(name)}` },
  { verb: "back", plain: "Going back a page" },
  { verb: "click", plain: "Clicking on the page", named: (name) => `Clicking ${quoted(name)}` },
  { verb: "type", plain: "Typing into the page", named: (name) => `Typing into ${quoted(name)}`, said: (text, name) => `Typing ${said(text)}${name ? ` into ${quoted(name)}` : ""}` },
  { verb: "search", plain: "Searching the page", said: (text) => `Searching the page for ${said(text)}` },
  { verb: "clear", plain: "Clearing a field", named: (name) => `Clearing ${quoted(name)}` },
  { verb: "select", plain: "Choosing an option", named: (name) => `Choosing an option in ${quoted(name)}` },
  { verb: "check", plain: "Ticking a box", named: (name) => `Ticking ${quoted(name)}` },
  { verb: "upload", plain: "Adding a file", named: (name) => `Adding a file to ${quoted(name)}` },
  // A list read named nothing: in a build's test, where every other step's card
  // named its subject, its card read a bare "Test run" (t194,
  // `run-murwcmx2-a1c6edf7`, screenshot 00016). The domain says what it reads.
  { verb: "read", plain: "Reading from the page", also: { word: /^(list|rows|records|items)$/u, plain: "Reading the list", named: (name) => `Reading the list of ${quoted(name)}`, byWords: true } },
  { verb: "describe", plain: "Reading the details of a control", named: (name) => `Reading the details of ${quoted(name)}` },
  {
    verb: "detect",
    plain: "Looking for a pattern on the page",
    also: { word: /^(repeating|list|structure)$/u, plain: "Looking for the repeating list on the page", named: (name) => `Looking for the repeating list around ${quoted(name)}` }
  },
  // "Looking at the page" said nothing a person could tell apart: a capture of
  // the whole page, a search for words and a control's details all read the
  // same (t193, live run `run-muqiojz4-04a7a8fc`). A capture is the whole page.
  { verb: "look", plain: "Looking over the whole page", said: (text) => `Looking for ${said(text)} on the page` },
  { verb: "scroll", plain: "Scrolling the page" },
  { verb: "wait", plain: "Waiting for the page" },
  { verb: "assert", plain: "Checking the page" },
  { verb: "download", plain: "Downloading a file" },
  { verb: "key", plain: "Pressing a key", said: (text, name) => `Pressing ${said(text)}${name ? ` in ${quoted(name)}` : ""}` },
  { verb: "dialog", plain: "Answering a dialog" },
  { verb: "tab", plain: "Switching tabs" }
];

/**
 * The name of the element a step acts on, when the step already carries it:
 * the element identity a resolved node keeps (`element`), which is part of the
 * Flow the person owns -- its accessible name, else the words it shows. Many
 * controls a page draws as plain elements have no accessible name: a dry run's
 * "+" and "12 Double Rolls" read "Test run" with no target (t193), and on
 * `run-muqiho5c-e830ce01` the playback of "Accept all", "7-in-1", "Spain", "Get
 * coupons" and "Not now" each read "Click · the page" (F36). Never a value
 * typed, read or observed.
 */
function elementName(parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const element = (parameters as { element?: unknown }).element;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  const identity = element as { accessibleName?: unknown; visibleText?: unknown };
  return automationStudioActivityHumanLabel(identity.accessibleName, 60) ?? automationStudioActivityHumanLabel(identity.visibleText, 60);
}

/** The most of an address path a title shows. */
const MAX_PATH = 60;
/** The page-start shorthand a page view writes an address in ("~/ip/napkins"). */
const START_RELATIVE = /^~(\/.*)?$/u;
/** An absolute address, scheme and authority first; group 1 is its path. Read by shape, so nothing is thrown for a value that is no address. */
const ABSOLUTE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]+(\/.*)?$/u;
/** A path segment that reads as a key or token: long, letters and digits, no word breaks. */
const TOKEN_SEGMENT = /^(?=[^/]*\d)(?=[^/]*[A-Za-z])[A-Za-z0-9+=]{16,}$/u;

/**
 * The page a navigate opens, in words a person can tell apart: its address
 * path, or "Home page" for the site's root. Never the host, the query or the
 * fragment -- a query can carry a token -- and a segment that reads as a key
 * is cut to "…". A long path keeps its end, which names the page, cut at the
 * front ("…/ip/napkins"). Nothing for a value that is no address.
 */
function pageName(parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const url = (parameters as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim() || /\s/u.test(url.trim())) return undefined;
  const path = addressPath(url.trim());
  if (path === undefined) return undefined;
  const segments = path.split("/").filter(Boolean).map((segment) => TOKEN_SEGMENT.test(segment) ? "…" : decoded(segment));
  if (!segments.length) return "Home page";
  const whole = `/${segments.join("/")}`;
  if (whole.length <= MAX_PATH) return whole;
  let kept = "";
  for (const segment of [...segments].reverse()) {
    const next = `/${segment}${kept}`;
    if (next.length + 1 > MAX_PATH) break;
    kept = next;
  }
  return kept ? `…${kept}` : `…${whole.slice(-(MAX_PATH - 1))}`;
}

/** The path of an absolute, root-relative or page-start-relative address, without its query or fragment. */
function addressPath(url: string): string | undefined {
  const bare = url.split(/[?#]/u)[0] ?? "";
  const start = START_RELATIVE.exec(bare);
  if (start) return start[1] ?? "/";
  if (bare.startsWith("/")) return bare;
  const absolute = ABSOLUTE.exec(bare);
  return absolute ? absolute[1] || "/" : undefined;
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Words a call types or looks for, collapsed and bounded; nothing for an empty one. */
function saidText(text: string | undefined): string | undefined {
  const collapsed = typeof text === "string" ? text.replace(/\s+/gu, " ").trim().replace(/"/gu, "'") : "";
  if (!collapsed) return undefined;
  return collapsed.length <= MAX_SAID ? collapsed : `${collapsed.slice(0, MAX_SAID - 1).trimEnd()}…`;
}

/**
 * The sentence for a sometimes-present step the run skipped because what it
 * acts on was not shown (`executor/step-skip/absent-step.ts`): the control by name when
 * the step carries one ("Skipped “Not now”: it was not shown"), else the
 * step's authored label, else "a step". It says skipped, never failed: the
 * popup or banner simply was not there this time.
 */
function notShownSentence(input: { parameters?: unknown; label?: string | undefined; words?: AutomationStudioActivityCallWords | undefined }): string {
  const name = automationStudioActivityHumanLabel(input.words?.target, 60) ?? elementName(input.parameters);
  if (name) return `Skipped ${quoted(name)}: it was not shown`;
  const label = automationStudioActivityHumanLabel(input.label, 120);
  return `Skipped ${label ? quoted(label) : "a step"}: what it acts on was not shown`;
}

/**
 * What a step does, in a person's words: its authored label when it has one
 * ("Open search"), else the verb its id names with the element's name when the
 * step carries one ("Clicking “Get a free quote”"), or for a navigate the
 * page's address path ("Opening “/ip/napkins”"), else the verb alone
 * ("Opening a page"). Nothing when the id names no known verb, so the caller
 * says something plain of its own rather than the id.
 *
 * With `notShown`, what a run says instead when it skipped the step because
 * what it acts on was not on the page; always a sentence, never nothing.
 */
export function automationStudioActivityAction(input: { id?: string | undefined; parameters?: unknown; label?: string | undefined; words?: AutomationStudioActivityCallWords | undefined; notShown?: boolean | undefined }): string | undefined {
  if (input.notShown === true) return notShownSentence(input);
  const label = automationStudioActivityHumanLabel(input.label, 120);
  if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  if (typeof input.id !== "string") return undefined;
  const words = (input.id.split(".").at(-1) ?? "").toLowerCase().split(/[-_\s]+/u).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const named = activityActionVerb(word)?.verb;
    const verb = named ? PHRASES.find((candidate) => candidate.verb === named) : undefined;
    if (!verb) continue;
    // The domain's own reading of the call first (the control a handle names,
    // the words it types), then the element a resolved node carries.
    const name = automationStudioActivityHumanLabel(input.words?.target, 60)
      ?? (verb.verb === "navigate" ? pageName(input.parameters) : verb.named || (verb.also?.named && !verb.also.byWords) ? elementName(input.parameters) : undefined);
    if (verb.also && words.slice(index + 1).some((rest) => verb.also!.word.test(rest))) return name && verb.also.named ? verb.also.named(name) : verb.also.plain;
    const text = saidText(input.words?.text);
    if (text !== undefined && verb.said) return verb.said(text, name);
    return name && verb.named ? verb.named(name) : verb.plain;
  }
  return undefined;
}
