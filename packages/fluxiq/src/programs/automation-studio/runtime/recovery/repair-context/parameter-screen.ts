// What a step ran with, as the Flow authored it, with only secrets and
// locators withheld.
//
// The model is shown the whole of what each step was authored with (2026-09-30,
// "the model sees the whole page"): every key, every list item, every string at
// its full length, and every URL with its path and query. There is no depth
// short of a recursion guard, no key or item count, no name-length bound, no
// URL-to-origin reduction and no vocabulary a key must belong to.
//
// **What is still withheld, and only this.**
//
// - A string shaped like a credential (`screenAutomationStudioLlmEvidence`).
// - Any value authored under a key that names a secret -- a password, secret,
//   token, key, credential, auth, OTP, PIN, CVV or card field
//   (`secret-named-key.ts`) -- because a four-digit PIN has no shape to catch.
// - A key the bound domain declared, or Core's own target keys: the key is
//   dropped and its path named, as before.
// - A string shaped like a way to address an element (`locator-text.ts`),
//   because a repair must name a control by what it is, not by a locator.
// - A URL carrying userinfo or a query parameter whose name names a secret.
//
// **The source is the Flow's authored parameters, not the run's resolved
// values, and that is deliberate.** `AutomationStudioNodeAttemptTrace.inputs` is
// not the node's parameters at all: `collectNodeInputs` returns the run's whole
// value bag merged with whatever arrived down an edge. The authored parameters
// are what the Flow says the step does, and where a parameter was state-bound,
// what is carried is the binding.
//
// A withheld value is named rather than dropped, for the reason the omission
// list in `context.ts` exists: a parameter that was screened out and a
// parameter the step never had must not read alike. A withheld string keeps its
// key with `null`; a list keeps its `count` beside every item that survived.
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
import { automationStudioSecretNamedKey } from "./secret-named-key.ts";

/** The parameters a step ran with, as the repair is shown them. */
export type AutomationStudioScreenedParameters = {
  /** What survived the screen, by the key it was authored under. */
  values: JsonObject;
  /**
   * The dotted paths whose authored value is not in `values` as the Flow wrote
   * it, in the order they were met. Never the values themselves.
   *
   * A refused path stands with `null` in `values`, or is absent where its key
   * was a denied one. An empty list means "as authored".
   *
   * **A list member is a dotted segment, not a bracketed index**, because this
   * record passes the whole-context locator screen and a `.` after a `]` is a
   * class selector to it: `extractList.where[0].matches[0]` reached the model as
   * `extractList.where[0][locator withheld][0]`. The module header argues it, and
   * `authored-state-screen.ts` spells the same position the same way.
   */
  withheld: string[];
};

/** A recursion guard, not a size bound: no authored parameter nests this deep. */
const MAX_DEPTH = 64;

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
  const values = screenedObject(parameters, denied, withheld, "", 0);
  return { values, withheld };
}

function screenedObject(source: JsonObject, denied: ReadonlySet<string>, withheld: string[], prefix: string, depth: number): JsonObject {
  const screened: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (denied.has(automationStudioEvidenceKey(key)) || automationStudioExecutableTargetKey(key)) {
      note(withheld, path);
      continue;
    }
    // A value under a secret-named key is withheld whatever it is, object or
    // list included; the key keeps its place with `null`.
    if (automationStudioSecretNamedKey(key) && value !== null) {
      note(withheld, path);
      screened[key] = null;
      continue;
    }
    // A key whose value did not survive keeps its place with `null`. The shape
    // is the half of this that a repair can always be given.
    screened[key] = screenedValue(key, value, denied, withheld, path, depth) ?? null;
  }
  return screened;
}

function screenedValue(key: string, value: JsonValue, denied: ReadonlySet<string>, withheld: string[], path: string, depth: number): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return screenedString(value, withheld, path);
  if (depth >= MAX_DEPTH) {
    note(withheld, path);
    return undefined;
  }
  if (Array.isArray(value)) {
    const items = value
      // A dotted index, not a bracketed one. The header says why: a `.` after a
      // `]` is a class selector to the screen this record passes through, so a
      // bracketed index destroyed every path that went through a list.
      .map((item, index) => screenedListItem(key, item, denied, withheld, `${path}.${index}`, depth + 1))
      .filter((item): item is JsonValue => item !== undefined);
    return { count: value.length, ...(items.length ? { items } : {}) };
  }
  return screenedObject(value, denied, withheld, path, depth + 1);
}

/** One item of a list, under the list's own key: an author cannot key a list item. */
function screenedListItem(key: string, item: JsonValue, denied: ReadonlySet<string>, withheld: string[], path: string, depth: number): JsonValue | undefined {
  if (item !== null && typeof item === "object" && !Array.isArray(item)) return screenedObject(item, denied, withheld, path, depth);
  return screenedValue(key, item, denied, withheld, path, depth);
}

/**
 * A string, carried whole unless it is shaped like a credential, is a URL that
 * carries one, or is shaped like a way to address an element.
 *
 * The locator check is the same function the whole context is screened with, so
 * a string that would have been rewritten to `[locator withheld]` is named as
 * withheld here instead: the rewrite is right for a sentence a domain wrote and
 * wrong for a parameter, where the marker would read as the value.
 */
function screenedString(value: string, withheld: string[], path: string): JsonValue | undefined {
  if (screenAutomationStudioLlmEvidence(value, []).secretShaped || urlCarryingSecret(value) || automationStudioLocatorShapedText(value)) {
    note(withheld, path);
    return undefined;
  }
  return value;
}

/**
 * Whether an absolute http(s) URL carries a credential: userinfo in its
 * authority (`https://user:pass@host`), or a query parameter whose name names a
 * secret (`?token=...`). Such a URL is withheld whole; any other URL is carried
 * with its path and query.
 */
function urlCarryingSecret(value: string): boolean {
  const matched = /^https?:\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/iu.exec(value);
  if (!matched) return false;
  if (matched[1]!.includes("@")) return true;
  // The raw name is read: the key screen splits on anything that is not a
  // letter, so an escaped separator (`session%5Fid`) still yields its words.
  return (matched[3] ?? "").split("&").some((pair) => {
    const name = pair.split("=")[0] ?? "";
    return name.length > 0 && automationStudioSecretNamedKey(name);
  });
}

function note(withheld: string[], path: string): void {
  if (path && !withheld.includes(path)) withheld.push(path);
}
