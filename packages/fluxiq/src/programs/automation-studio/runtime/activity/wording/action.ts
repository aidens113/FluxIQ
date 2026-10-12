import { activityActionVerb, type ActivityActionVerb } from "../../../../../ui/index.ts";
import { automationStudioActivityHumanLabel } from "./human-label.ts";
import { automationStudioActivityListName } from "./list-name.ts";
import { automationStudioActivityPageName } from "./page-name.ts";

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
  also?: { word: RegExp; plain: string; named?: (name: string) => string; byWords?: true; listed?: (list: string) => string };
};

/**
 * What a call names, in words a person reads (`AutomationStudioLlmEvidenceCallWords`):
 * the control, and the words it types or looks for. `list` is what the page
 * calls the list a detection found, read off its answer once it has one
 * (`../call-context.ts`, R2-U-9), never off the call. `role` is what the page
 * view printed the control as, kept only where it tells a box from an option
 * ("checkbox", "radio", ...; "" for neither, `../call-context.ts`): a call that
 * carries a handle and no element is read by it.
 */
export type AutomationStudioActivityCallWords = { target?: string | undefined; text?: string | undefined; list?: string | undefined; role?: string | undefined };

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
  // `run-muqiojz4-04a7a8fc`). Its address path then put "/scenarios/crossb…"
  // in the chat and the overlay (t174-w108 D2): a page is named by its site,
  // and one served from this machine by being the start or by its path's
  // words (`./page-name.ts`). "The start page" and "the home page" are said
  // unquoted, so a card does not read them as a control.
  { verb: "navigate", plain: "Opening a page", named: (name) => OWN_PAGE.test(name) ? `Opening ${name}` : `Opening ${quoted(name)}` },
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
  // `run-murwcmx2-a1c6edf7`, screenshot 00016). The domain says what it reads,
  // and Core names the list by two of its fields, so the overlay and every
  // card say one name (`./list-name.ts`, R2-U-8).
  { verb: "read", plain: "Reading from the page", also: { word: /^(list|rows|records|items)$/u, plain: "Reading the list", named: (name) => `Reading the list of ${quoted(automationStudioActivityListName(name))}`, byWords: true } },
  { verb: "describe", plain: "Reading the details of a control", named: (name) => `Reading the details of ${quoted(name)}` },
  {
    verb: "detect",
    plain: "Looking for a pattern on the page",
    // A list the page names (a heading, an accessible name) is said by that
    // name once the detection has found it: "Look · the repeating list on the
    // page" said nothing of which list (R2-U-9, `run-muwansvz-a2b4a987`).
    also: {
      word: /^(repeating|list|structure)$/u,
      plain: "Looking for the repeating list on the page",
      named: (name) => `Looking for the repeating list around ${quoted(name)}`,
      listed: (list) => `Looking for the list ${quoted(list)}`
    }
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
 * Flow the person owns -- the field's own label, else its accessible name,
 * else the words it shows. Many controls a page draws as plain elements have
 * no accessible name: a dry run's "+" and "12 Double Rolls" read "Test run"
 * with no target (t193), and on `run-muqiho5c-e830ce01` the playback of
 * "Accept all", "7-in-1", "Spain", "Get coupons" and "Not now" each read
 * "Click · the page" (F36). A field's label comes first: the quantity field
 * carried only `label: "Quantity"` and its card read "Type · Done", and a
 * search box's accessible name was its placeholder (t174-w108 D5). Never a
 * value typed, read or observed.
 */
function elementName(parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const element = (parameters as { element?: unknown }).element;
  if (!element || typeof element !== "object" || Array.isArray(element)) return undefined;
  const identity = element as { label?: unknown; accessibleName?: unknown; visibleText?: unknown };
  return automationStudioActivityHumanLabel(identity.label, 60)
    ?? automationStudioActivityHumanLabel(identity.accessibleName, 60)
    ?? automationStudioActivityHumanLabel(identity.visibleText, 60);
}

/** Roles and input types of a box a person ticks; anything else a "check" sets is an option chosen. */
const BOX_ROLES = new Set(["checkbox", "switch", "menuitemcheckbox"]);
/** Roles and input types of one option of several, chosen rather than ticked. */
const CHOICE_ROLES = new Set(["radio", "option", "menuitemradio", "tab"]);
/** A choice said as one: "Choosing “Space Grey”", which a card reads back as "Choose". */
const CHOICE: Phrase = { verb: "select", plain: "Choosing an option", named: (name) => `Choosing ${quoted(name)}` };

/**
 * True when a step that sets something "checked" acts on an option chosen
 * from several -- a colour swatch, a size chip, a radio button -- rather than
 * a box ticked: its element is a radio or an option by role or input type, or
 * says neither, as a swatch the page draws as a plain element does. A swatch's
 * step read "Tick · Space Grey" and "Ticking “7-in-1”" (R4a,
 * `run-mv2nlh9l-52e476da`, moment 04). A box says so by its role or input
 * type. A model's exploration call carries a handle and no element, so its
 * role is the one the page view printed for that handle (`words.role`,
 * `../call-context.ts`), read by the same rule: its swatches read "Ticking
 * “Spain”" while the same steps in a test read "Choose" (R4a attempt 2,
 * `run-mv2pgqkj-f3552c70`, moment 04). A step that carries neither is a box.
 */
function chosen(parameters: unknown, words: AutomationStudioActivityCallWords | undefined): boolean {
  const element = parameters && typeof parameters === "object" && !Array.isArray(parameters) ? (parameters as { element?: unknown }).element : undefined;
  const carried = element && typeof element === "object" && !Array.isArray(element) ? element : undefined;
  if (!carried && typeof words?.role !== "string") return false;
  const identity = (carried ?? { role: words?.role }) as { role?: unknown; inputType?: unknown };
  const lower = (value: unknown): string => typeof value === "string" ? value.trim().toLowerCase() : "";
  const role = lower(identity.role);
  const type = lower(identity.inputType);
  if (BOX_ROLES.has(role) || BOX_ROLES.has(type)) return false;
  return CHOICE_ROLES.has(role) || CHOICE_ROLES.has(type) || (role === "" && type === "");
}

/** The pages `./page-name.ts` names in words of its own, said unquoted. */
const OWN_PAGE = /^the (?:start|home) page$/u;

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
 * page's site ("Opening “amazon.com”", "Opening the start page"), else the verb alone
 * ("Opening a page"). Nothing when the id names no known verb, so the caller
 * says something plain of its own rather than the id. `start` is the address
 * the Flow or the build starts at, where the caller knows it: only a page at
 * that address is "the start page" (`./page-name.ts`).
 *
 * With `notShown`, what a run says instead when it skipped the step because
 * what it acts on was not on the page; always a sentence, never nothing.
 */
export function automationStudioActivityAction(input: { id?: string | undefined; parameters?: unknown; label?: string | undefined; words?: AutomationStudioActivityCallWords | undefined; notShown?: boolean | undefined; start?: string | undefined }): string | undefined {
  if (input.notShown === true) return notShownSentence(input);
  const label = automationStudioActivityHumanLabel(input.label, 120);
  if (label) return label.charAt(0).toUpperCase() + label.slice(1);
  if (typeof input.id !== "string") return undefined;
  const words = (input.id.split(".").at(-1) ?? "").toLowerCase().split(/[-_\s]+/u).filter(Boolean);
  for (const [index, word] of words.entries()) {
    const named = activityActionVerb(word)?.verb;
    const verb = named === "check" && chosen(input.parameters, input.words) ? CHOICE : named ? PHRASES.find((candidate) => candidate.verb === named) : undefined;
    if (!verb) continue;
    // The domain's own reading of the call first (the control a handle names,
    // the words it types), then the element a resolved node carries.
    const name = automationStudioActivityHumanLabel(input.words?.target, 60)
      ?? (verb.verb === "navigate" ? automationStudioActivityPageName(input.parameters, input.start) : verb.named || (verb.also?.named && !verb.also.byWords) ? elementName(input.parameters) : undefined);
    if (verb.also && words.slice(index + 1).some((rest) => verb.also!.word.test(rest))) {
      const list = verb.also.listed ? automationStudioActivityHumanLabel(input.words?.list, 60) : undefined;
      if (list && verb.also.listed) return verb.also.listed(list);
      return name && verb.also.named ? verb.also.named(name) : verb.also.plain;
    }
    const text = saidText(input.words?.text);
    if (text !== undefined && verb.said) return verb.said(text, name);
    return name && verb.named ? verb.named(name) : verb.plain;
  }
  return undefined;
}
