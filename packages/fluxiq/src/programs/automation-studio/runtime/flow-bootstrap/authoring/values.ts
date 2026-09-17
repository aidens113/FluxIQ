// Reading one written value as the value a parameter takes.
//
// The model writes text, and a parameter wants a boolean, a number, a list or
// an object. Every conversion here is one a reader would make without being
// told: `no` is false, `1, 2` is a list, `{...}` that parses is the object it
// spells, and a bare name where an object belongs is the handle the evidence
// issued. A value this module cannot read is returned as `undefined`, and the
// caller refuses the parameter naming the shape it accepts -- it never guesses.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeParameter } from "../../../nodes/index.ts";
import { authoringKey } from "./keys.ts";

/**
 * The key a handle reference is written under.
 *
 * `runtime/llm/harness-options/plan-node-handles.ts` owns the reference shape
 * and resolves it, and that directory imports this one, so reading the constant
 * back out of it would close a module cycle -- exactly the fault this
 * repository's structure audit exists to prevent, and one that arrives as an
 * `undefined` constant with a clean type check. A test in that directory builds
 * a reference through this module and asserts the resolver sees one, so the two
 * are held together by behaviour rather than by an import.
 */
export const AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY = "handle";

const TRUE_WORDS = new Set(["true", "yes", "on", "1", "checked", "enabled"]);
const FALSE_WORDS = new Set(["false", "no", "off", "0", "unchecked", "disabled", "none"]);
/** The handle syntax, as `runtime/llm` declares it for a target override. */
const HANDLE_TOKEN = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]*[A-Za-z0-9])?$/u;
const HANDLE_MAX_LENGTH = 64;
const PAIR = /^([A-Za-z0-9_.:-]{1,100})\s*=\s*(.*)$/u;

/** One written value read as the parameter's declared type, or `undefined` when it cannot be. */
export function authoringParameterValue(text: string, parameter: AutomationNodeParameter): JsonValue | undefined {
  if (parameter.options) return optionValue(text, parameter);
  // A record output is filled in from the contract, not read as an object
  // here: a bare name written for one is the dataset's name, never a handle.
  if (parameter.ui?.control === "record-output") return jsonValue(text) ?? text;
  switch (parameter.valueType) {
    case "boolean": return booleanValue(text);
    case "number": return numberValue(text);
    case "array": return listValue(text);
    case "object":
    case "json": return objectValue(text);
    default: return text;
  }
}

/** A value written under a dotted key, read without a declared type to guide it. */
export function authoringNestedValue(text: string): JsonValue {
  const parsed = jsonValue(text);
  if (parsed !== undefined) return parsed;
  if (TRUE_WORDS.has(authoringKey(text))) return true;
  if (FALSE_WORDS.has(authoringKey(text))) return false;
  const numeric = numberValue(text);
  return numeric ?? text;
}

/** Write `value` at `path` inside `target`, creating the objects on the way. */
export function authoringSetAtPath(target: JsonObject, path: string[], value: JsonValue): boolean {
  let cursor: JsonObject = target;
  for (const [index, segment] of path.entries()) {
    if (index === path.length - 1) {
      cursor[segment] = value;
      return true;
    }
    const next = cursor[segment];
    if (next === undefined || next === null) cursor = (cursor[segment] = {});
    else if (isJsonObject(next)) cursor = next;
    else return false;
  }
  return false;
}

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a written word is the kind of token a domain mints as a handle. */
export function isAuthoringHandleToken(text: string): boolean {
  return text.length > 0 && text.length <= HANDLE_MAX_LENGTH && HANDLE_TOKEN.test(text);
}

function optionValue(text: string, parameter: AutomationNodeParameter): JsonValue | undefined {
  const written = authoringKey(text);
  const match = parameter.options?.find((option) => authoringKey(option.value) === written || authoringKey(option.label) === written);
  return match?.value;
}

function booleanValue(text: string): boolean | undefined {
  const word = authoringKey(text);
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return undefined;
}

function numberValue(text: string): number | undefined {
  const cleaned = text.trim().replace(/,/gu, "");
  if (!/^[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?$/iu.test(cleaned)) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function listValue(text: string): JsonValue[] {
  const parsed = jsonValue(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed !== undefined) return [parsed];
  const items = text.split(/\s*,\s*/u).map((item) => item.trim()).filter(Boolean);
  return items.length ? items.map((item) => authoringNestedValue(item)) : [];
}

function objectValue(text: string): JsonValue | undefined {
  const parsed = jsonValue(text);
  if (parsed !== undefined) return parsed;
  if (!text) return {};
  const pairs = text.split(/\s*,\s*/u).map((item) => PAIR.exec(item.trim()));
  if (pairs.length && pairs.every((pair) => pair !== null)) {
    const object: JsonObject = {};
    for (const pair of pairs) object[pair![1]!] = authoringNestedValue(pair![2]!.trim());
    return object;
  }
  return isAuthoringHandleToken(text) ? { [AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY]: text } : undefined;
}

/** Text read as the JSON it spells, when it spells JSON and nothing else. */
function jsonValue(text: string): JsonValue | undefined {
  const trimmed = text.trim();
  if (!/^[[{]/u.test(trimmed)) return undefined;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch (failure) {
    // Text that is not JSON is the ordinary case and means "read it another
    // way"; anything else is not this text's fault and is not swallowed.
    if (failure instanceof SyntaxError) return undefined;
    throw failure;
  }
}
