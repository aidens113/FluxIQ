// What a step ran with, as much of it as can be said without saying what the
// person's data was.
//
// The rule this sits under is `recovery/context.ts`'s: shapes and names, never
// values. Until now that rule was applied by refusing the parameters outright,
// so a repair was told *that* an extraction ran and produced 24 rows, and never
// which columns it asked for or which control the step before it typed into. A
// repair that cannot see that a step typed into the wrong box, or read the
// wrong column, is being asked to fix something it has not been shown.
//
// So the parameters are screened rather than refused, and the screen is made of
// the two Core already has -- `screenAutomationStudioLlmEvidence` for the bound
// domain's declared keys and for credential shapes, and `locator-text.ts` for a
// string shaped like a way to address an element. Nothing new looks at the
// data.
//
// **The source is the Flow's authored parameters, not the run's resolved
// values, and that is deliberate.** `AutomationStudioNodeAttemptTrace.inputs` is
// not the node's parameters at all: `collectNodeInputs` returns the run's whole
// value bag merged with whatever arrived down an edge, so it holds every value
// the run has accumulated. The node's resolved parameters exist for the length
// of one call in `node-execution.ts` and are never recorded. The authored
// parameters are what the Flow says the step does, they are the same class of
// data as `expectedState` -- which `context.ts` already lets through, because
// the user wrote it and it is in the document the model is reasoning about --
// and where a parameter was state-bound, what is carried is the binding, which
// names where the value came from instead of what it was.
//
// **Four kinds of value, and one of them is never carried.**
//
// - A number or a boolean is carried whole. A timeout, a row minimum, a scroll
//   offset and a `paginate: false` are what the step did, and no page or person
//   is in them.
// - A string is carried only where its *key* is Core's word for what something
//   is, for what it is called, or for what it was compared against.
//   `parameter-vocabulary.ts` is that vocabulary and the argument for every word
//   in it: a **classifier** is Core's word wherever it sits, a **name** and a
//   **comparand** only while the keys are a node definition's own declared ids
//   rather than an author's, and `text` and `value` are in none of the three
//   lists at any depth, because on a typing step they are the person's data.
// - A string that is an absolute URL is carried as its origin, whatever its
//   key, and its path is named in `withheld` when the Flow wrote more than the
//   origin. That is the one transform that turns a value into a fact about where
//   the step went without carrying the query it went with, and a transform that
//   says nothing about itself is worse than a refusal, because an empty omission
//   list positively asserts that the parameters are as authored.
// - Everything else is withheld: the key stays, with `null` where its value
//   would have been, and the path is recorded in `withheld`. So the *shape* of
//   what the step ran with is complete even where none of it could be carried,
//   which is what puts an extraction's column ids in front of the repair --
//   the field map's keys are the columns it asked the page for.
//
// **Two rules decide whether a key is Core's word, and they live apart.** They
// answer different halves of one problem, and the problem is that what has to be
// carried is not monotone in depth: `fields.price` is a column an author
// invented, holding the page's own field name, and must stay withheld, while
// `fields.price.kind` one level deeper must come through. No allowance reaches
// the second without reaching the first, so no single rule can answer both.
// `parameter-vocabulary.ts` holds one half -- the split of Core's words into
// classifiers, names and comparands, the depth each kind is read at, the run that
// forced the split, and the argument for every word admitted since. This file
// holds the other: **a list and its items are one level, in both counters**,
// stated at `ScreenPosition` and applied in `screenedListItem`. An author cannot
// key a list, so a condition inside `where` is keyed by the definition exactly as
// `where` itself is.
//
// That second half was once only half-applied, and finishing it is what put a
// condition's comparison target in front of a repair at all: an object item was
// screened at the list's level while a *string* item was screened with no key at
// all, so no key rule could ever reach one. That is what made
// `name: ["Add to cart"]` a bare count where `name: "Add to cart"` is carried,
// and the condition grammar takes one value or a list of them and means one
// condition by both. An item's key is its list's, which carries exactly what the
// scalar form of that key would have carried and nothing more.
//
// A withheld value is named rather than dropped, for the reason the omission
// list in `context.ts` exists: a parameter that was screened out and a
// parameter the step never had must not read alike.
//
// **A *reduced* value is named for the same reason, and it took a diagnosis to
// notice.** Reducing a URL to its origin is a transform rather than a refusal, so
// while it went unrecorded every navigate node in every run bundle read
//
//     "parameters": { "url": "http://127.0.0.1:<port>", "newTab": false },
//     "parametersWithheld": []
//
// -- a navigate to `/search?k=earbuds` and a navigate to `/` were the same
// record, and the empty list asserted that nothing had been touched. Ten live
// attempts on one scenario could not be told apart by the page they read, and the
// debug had to infer it from how long each took. That is the reading the
// paragraph above forbids, reached from the other side: a *transformed* parameter
// read like an untouched one.
//
// So `withheld` names every path whose value in `values` is not what the Flow
// authored, a reduction included: the origin stands in `values`, the path stands
// in `withheld`, and together they say "this origin, and there was more after
// it". A reader can conclude which *site* a step acted on and that it was not the
// site's root; which page they still cannot, because that is where a search term,
// an order number and a session token live. A URL that was already bare is not
// named, which is what makes the two cases tellable apart.
//
// **And a name is only a name if it arrives as one.** The list goes out inside a
// section, so it passes the whole-context locator screen with every other string
// in the request -- and a path through a list index *is* locator-shaped. The
// class-selector shape is `(?<![\w.])\.[A-Za-z_][\w-]*`; a `.` after a `]`
// satisfies that lookbehind, so while this file wrote bracketed indices what a
// model read was
//
//     "parametersWithheld": ["extractList.where[0][locator withheld][0]"]
//
// which is worse than a loss: `extractList.where[0].read` arrived as
// `extractList.where[0][locator withheld]`, naming no parameter at all and
// reading as though a *selector* had been withheld rather than a comparand. Every
// path this file minted through a list was destroyed that way, and the extraction
// parameters whose comparands legitimately stay withheld are made almost entirely
// of list paths -- so the names that mattered most were the ones that never
// arrived. That is the silent drop the paragraph above forbids, reached from a
// third side.
//
// **The screen is not what is wrong, and exempting a path from it would be the
// wrong fix.** A path is not Core's string: Core mints the separators and the
// indices, and every other segment is a key an author or a domain wrote, so
// `extractList.fields.#confirm.kind` has to keep being redacted. An exemption for
// "a path Core minted" would carry an author's own locator into the request as
// bookkeeping -- and it could not honestly be written even if it were wanted,
// because the screen is handed a string and nothing else, and the pre-flight in
// `runtime/llm/deepseek/refusal.ts` re-checks the same shapes downstream with
// less to go on than that. `recovery/tests/request-locator-shapes.test.ts` holds
// the invariant over the *whole* request: no string leaving here matches a shape
// the screen names. A path that needs an exemption to survive is a path that
// breaks a stated guarantee.
//
// So **a list member is a dotted segment**: `extractList.where.0.matches.0`,
// which survives the screen untouched, while a path through an author's
// locator-shaped key is still caught -- the screen doing its job on a path
// instead of mangling one. `authored-state-screen.ts` reached the same spelling
// from the other side, and the two screens now name one position in one notation
// rather than in two. The dot costs one thing: a list index and a key literally
// named `0` are spelled alike. That is affordable because this list is read by a
// model looking for a position and is parsed back into a pointer by nobody --
// `step-parameters.ts` passes it through to `parametersWithheld` and nothing else
// in the repository reads it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioEvidenceKey,
  automationStudioExecutableTargetKey,
  automationStudioLocatorShapedText,
  screenAutomationStudioLlmEvidence
} from "../../llm/harness/index.ts";
import { coreVocabularyKey } from "./parameter-vocabulary.ts";

/** The parameters a step ran with, as the repair is shown them. */
export type AutomationStudioScreenedParameters = {
  /** What survived the screen, by the key it was authored under. */
  values: JsonObject;
  /**
   * The dotted paths whose authored value is not in `values` as the Flow wrote
   * it, in the order they were met. Never the values themselves.
   *
   * A refusal and a reduction are both named, and `values` is what tells them
   * apart: a refused path stands with `null`, a URL reduced to its origin stands
   * with the origin. An empty list has to be able to mean "as authored".
   *
   * **A list member is a dotted segment, not a bracketed index**, because this
   * record passes the whole-context locator screen and a `.` after a `]` is a
   * class selector to it: `extractList.where[0].matches[0]` reached the model as
   * `extractList.where[0][locator withheld][0]`. The module header argues it, and
   * `authored-state-screen.ts` spells the same position the same way.
   */
  withheld: string[];
};

const MAX_DEPTH = 3;
const MAX_KEYS_PER_OBJECT = 12;
const MAX_ITEMS_PER_ARRAY = 6;
const MAX_NAME_LENGTH = 80;
const MAX_WITHHELD_PATHS = 16;

/**
 * The screened form of one node's authored parameters.
 *
 * `deniedKeys` is the bound domain's declaration, passed as declared. A caller
 * with no declaration must not call this: an absent declaration means nobody
 * said, never "deny nothing", and the section is recorded as withheld instead.
 */
export function automationStudioScreenedNodeParameters(parameters: JsonObject, deniedKeys: readonly string[]): AutomationStudioScreenedParameters {
  const denied = new Set(deniedKeys.map(automationStudioEvidenceKey));
  const withheld: string[] = [];
  const values = screenedObject(parameters, denied, withheld, "", { depth: 0, nameDepth: 0 });
  return { values, withheld: withheld.slice(0, MAX_WITHHELD_PATHS) };
}

/**
 * Where a value sits, in the two senses that matter.
 *
 * `depth` bounds the recursion. `nameDepth` counts the levels whose keys could
 * be an author's rather than a node definition's. It is the one thing about a
 * position the vocabulary is given: `coreVocabularyKey` reads it to decide
 * whether a name or a comparand key is Core's word here, and
 * `parameter-vocabulary.ts` holds the allowance it is compared against.
 *
 * A list is one level in both, item objects included: an author cannot key a
 * list, so `where.3.field` is as much the definition's vocabulary as `where`
 * itself, and counting the object behind the index counted the index. The
 * recursion stays bounded because a list still spends a level of `depth` --
 * what it no longer does is spend a second one on the object it holds.
 */
type ScreenPosition = { depth: number; nameDepth: number };

function screenedObject(source: JsonObject, denied: ReadonlySet<string>, withheld: string[], prefix: string, at: ScreenPosition): JsonObject {
  const screened: JsonObject = {};
  for (const [key, value] of Object.entries(source).slice(0, MAX_KEYS_PER_OBJECT)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (denied.has(automationStudioEvidenceKey(key)) || automationStudioExecutableTargetKey(key)) {
      note(withheld, path);
      continue;
    }
    // A key whose value did not survive keeps its place with `null`. The shape
    // is the half of this that a repair can always be given.
    screened[key] = screenedValue(key, value, denied, withheld, path, at) ?? null;
  }
  return screened;
}

function screenedValue(key: string, value: JsonValue, denied: ReadonlySet<string>, withheld: string[], path: string, at: ScreenPosition): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return screenedString(key, value, withheld, path, at);
  if (at.depth >= MAX_DEPTH) {
    note(withheld, path);
    return undefined;
  }
  if (Array.isArray(value)) {
    const inside: ScreenPosition = { depth: at.depth + 1, nameDepth: at.nameDepth };
    const items = value.slice(0, MAX_ITEMS_PER_ARRAY)
      // A dotted index, not a bracketed one. The header says why: a `.` after a
      // `]` is a class selector to the screen this record passes through, so a
      // bracketed index destroyed every path that went through a list.
      .map((item, index) => screenedListItem(key, item, denied, withheld, `${path}.${index}`, inside))
      .filter((item): item is JsonValue => item !== undefined);
    return { count: value.length, ...(items.length ? { items } : {}) };
  }
  return screenedObject(value, denied, withheld, path, { depth: at.depth + 1, nameDepth: at.nameDepth + 1 });
}

/**
 * One item of a list, at the list's own level and under the list's own key.
 *
 * An item that is an object is screened as an object *here* rather than through
 * `screenedValue`, which would advance both counters again. The level the item
 * sits at is the list's: its keys are the item shape the definition declared,
 * and the `MAX_DEPTH` guard for that level was already applied to the list.
 *
 * An item that is not an object has no key of its own, so it is screened under
 * `key`, the list's. That is the same statement from the other side: if an
 * author cannot key a list, the only key a scalar item can be read under is the
 * one the definition gave the list.
 */
function screenedListItem(key: string, item: JsonValue, denied: ReadonlySet<string>, withheld: string[], path: string, at: ScreenPosition): JsonValue | undefined {
  if (item !== null && typeof item === "object" && !Array.isArray(item)) return screenedObject(item, denied, withheld, path, at);
  return screenedValue(key, item, denied, withheld, path, at);
}

/**
 * A string, carried only where its key is one of Core's own words for what it
 * is -- `parameter-vocabulary.ts` -- or where it is an absolute URL, and in
 * neither case a credential or a way to address an element.
 *
 * The locator check is the same function the whole context is screened with, so
 * a string that would have been rewritten to `[locator withheld]` is named as
 * withheld here instead: the rewrite is right for a sentence a domain wrote and
 * wrong for a parameter, where the marker would read as the value.
 */
function screenedString(key: string, value: string, withheld: string[], path: string, at: ScreenPosition): JsonValue | undefined {
  if (screenAutomationStudioLlmEvidence(value, []).secretShaped) {
    note(withheld, path);
    return undefined;
  }
  const origin = absoluteUrlOrigin(value);
  if (origin) {
    // Carried, but not as the Flow wrote it, so the path is named. A URL that
    // was already bare is not: nothing was dropped from it, and naming it would
    // invent a path the step never had.
    if (value !== origin && value !== `${origin}/`) note(withheld, path);
    return origin;
  }
  if (!coreVocabularyKey(key, at.nameDepth) || value.length > MAX_NAME_LENGTH || automationStudioLocatorShapedText(value)) {
    note(withheld, path);
    return undefined;
  }
  return value;
}

/**
 * The origin of an absolute http(s) URL, or nothing.
 *
 * Only the origin: the path and the query are where an order number, a search
 * term and a session token live, and which *site* the run went to is answered by
 * the origin alone. Which page is not, so the caller names the path as dropped
 * rather than leaving the origin to pass for the whole URL. A relative path is
 * not a URL here -- it is ordinary text and
 * falls to the key rule with everything else. An authority carrying userinfo
 * (`https://user:pass@host`) is refused rather than trimmed, because the thing
 * being trimmed off would be a credential.
 *
 * Matched rather than parsed. `new URL` throws on input it will not take, and a
 * caught throw answered `undefined` here, which is a refusal that reads exactly
 * like text that was not a URL -- the reading `context.ts` spends its whole
 * omission list keeping apart. The pattern says what an origin is and nothing
 * is thrown.
 */
function absoluteUrlOrigin(value: string): string | undefined {
  const matched = /^(https?:\/\/[A-Za-z0-9._~-]+(?::\d{1,5})?)(?:[/?#]|$)/iu.exec(value);
  return matched?.[1];
}

function note(withheld: string[], path: string): void {
  if (path && withheld.length < MAX_WITHHELD_PATHS && !withheld.includes(path)) withheld.push(path);
}
