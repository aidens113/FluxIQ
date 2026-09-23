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
//   is called rather than for what it holds -- `label`, `name`, `role`,
//   `field`, `column` and the rest of `NAME_KEYS` -- and only in the top two
//   levels of a parameter, where the keys are the node definition's own
//   declared ids. Deeper than that the keys are whatever the author wrote: an
//   extraction's field map is keyed by the column names *the model chose*, so
//   reading `name` there as Core's word for a name would carry one column's
//   page field and withhold the next one's for no reason a reader could state.
//   `text` and `value` are absent from the list at every depth: on a typing
//   step they are the person's data.
// - A string that is an absolute URL is carried as its origin, whatever its
//   key. That is the one transform that turns a value into a fact about where
//   the step went without carrying the query it went with.
// - Everything else is withheld: the key stays, with `null` where its value
//   would have been, and the path is recorded in `withheld`. So the *shape* of
//   what the step ran with is complete even where none of it could be carried,
//   which is what puts an extraction's column ids in front of the repair --
//   the field map's keys are the columns it asked the page for.
//
// A withheld value is named rather than dropped, for the reason the omission
// list in `context.ts` exists: a parameter that was screened out and a
// parameter the step never had must not read alike.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioEvidenceKey,
  automationStudioExecutableTargetKey,
  automationStudioLocatorShapedText,
  screenAutomationStudioLlmEvidence
} from "../../llm/harness/index.ts";

/** The parameters a step ran with, as the repair is shown them. */
export type AutomationStudioScreenedParameters = {
  /** What survived the screen, by the key it was authored under. */
  values: JsonObject;
  /** The dotted paths whose value was not carried, in the order they were met. Never the values themselves. */
  withheld: string[];
};

/**
 * The keys whose string value names something rather than holds something.
 *
 * Core cannot tell a control's label from a person's typed text by looking at
 * either, so it does not try: it reads the key. This is the whole list, it is
 * Core's own vocabulary rather than any medium's, and it is short on purpose --
 * a key that is not here has its value withheld, which is the safe answer for
 * a key nobody has thought about yet.
 */
const NAME_KEYS: ReadonlySet<string> = new Set([
  "label", "name", "title", "caption", "heading", "placeholder", "arialabel", "accessiblename",
  "visibletext", "role", "implicitrole", "tagname", "kind", "mode", "op", "is", "key",
  "field", "fieldid", "column", "columnid", "status", "type", "unit"
]);

const MAX_DEPTH = 3;
/** The deepest level at which a key is the node definition's vocabulary rather than the author's. */
const MAX_NAMED_KEY_DEPTH = 1;
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
 * `depth` bounds the recursion and counts every level, array levels included.
 * `nameDepth` counts only the levels whose keys are a node definition's own --
 * a list's index is not a name, so an array does not advance it, and
 * `where[3].field` is read as the same kind of key as `element.name`.
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
    const items = value.slice(0, MAX_ITEMS_PER_ARRAY)
      .map((item, index) => screenedValue("", item, denied, withheld, `${path}[${index}]`, { depth: at.depth + 1, nameDepth: at.nameDepth }))
      .filter((item): item is JsonValue => item !== undefined);
    return { count: value.length, ...(items.length ? { items } : {}) };
  }
  return screenedObject(value, denied, withheld, path, { depth: at.depth + 1, nameDepth: at.nameDepth + 1 });
}

/**
 * A string, carried only where it is a name, an origin, and neither a
 * credential nor a way to address an element.
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
  if (origin) return origin;
  const named = at.nameDepth <= MAX_NAMED_KEY_DEPTH && NAME_KEYS.has(automationStudioEvidenceKey(key));
  if (!named || value.length > MAX_NAME_LENGTH || automationStudioLocatorShapedText(value)) {
    note(withheld, path);
    return undefined;
  }
  return value;
}

/**
 * The origin of an absolute http(s) URL, or nothing.
 *
 * Only the origin: the path and the query are where an order number, a search
 * term and a session token live, and where the run went is answered by the
 * origin alone. A relative path is not a URL here -- it is ordinary text and
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
