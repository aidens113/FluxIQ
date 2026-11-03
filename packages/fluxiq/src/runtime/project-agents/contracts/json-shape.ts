// The one reader every project-agent contract parses with.
//
// Everything a project agent hands another -- a task spec, a structure plan, a
// brief, a builder's return -- arrives as model output or as a file someone
// could have edited. So a parser reads own data properties of plain objects
// only, refuses a key it does not know, and answers with a code and the path of
// the first thing it refused, never with a best guess.

/** What a parser answers: the parsed value, or the first refusal and where it was. */
export type AutomationStudioProjectParse<T> =
  | { status: "valid"; value: T }
  | { status: "invalid"; code: string; path: string };

class Refusal extends Error {
  constructor(readonly code: string, readonly path: string) {
    super(code);
  }
}

const DIGEST = /^[a-f0-9]{64}$/u;
const STORAGE_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;

/** Field readers that throw a refusal; `parse` turns the first one into an answer. */
export const automationStudioProjectJsonShape = Object.freeze({
  parse<T>(read: () => T): AutomationStudioProjectParse<T> {
    try {
      return { status: "valid", value: read() };
    } catch (error) {
      if (error instanceof Refusal) return { status: "invalid", code: error.code, path: error.path };
      throw error;
    }
  },

  refuse(code: string, path: string): never {
    throw new Refusal(code, path);
  },

  /** A plain object whose keys are exactly the required ones plus any of the optional ones. */
  object(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return automationStudioProjectJsonShape.refuse("project.not_object", path);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return automationStudioProjectJsonShape.refuse("project.not_plain", path);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const out: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return automationStudioProjectJsonShape.refuse("project.symbol_key", path);
      if (!required.includes(key) && !optional.includes(key)) return automationStudioProjectJsonShape.refuse("project.unknown_field", `${path}.${key}`);
      const descriptor = descriptors[key]!;
      if (!Object.hasOwn(descriptor, "value")) return automationStudioProjectJsonShape.refuse("project.accessor_field", `${path}.${key}`);
      if (descriptor.value === undefined) continue;
      out[key] = descriptor.value;
    }
    for (const key of required) {
      if (!Object.hasOwn(out, key)) return automationStudioProjectJsonShape.refuse("project.missing_field", `${path}.${key}`);
    }
    return out;
  },

  array(value: unknown, path: string, max: number): unknown[] {
    if (!Array.isArray(value)) return automationStudioProjectJsonShape.refuse("project.not_array", path);
    if (value.length > max) return automationStudioProjectJsonShape.refuse("project.too_many", path);
    return [...value];
  },

  /** Non-empty, trimmed, single-line text of at most `max` characters. */
  id(value: unknown, path: string, max = 200): string {
    if (typeof value !== "string" || !value || value.length > max || value.trim() !== value || CONTROL.test(value)) return automationStudioProjectJsonShape.refuse("project.invalid_id", path);
    return value;
  },

  /** An id that is also a file name segment unchanged by `safeSegment`. */
  storageId(value: unknown, path: string): string {
    if (typeof value !== "string" || !STORAGE_ID.test(value)) return automationStudioProjectJsonShape.refuse("project.invalid_storage_id", path);
    return value;
  },

  /** Text with at least one visible character, at most `max` characters. */
  text(value: unknown, path: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > max) return automationStudioProjectJsonShape.refuse("project.invalid_text", path);
    return value;
  },

  digest(value: unknown, path: string): string {
    if (typeof value !== "string" || !DIGEST.test(value)) return automationStudioProjectJsonShape.refuse("project.invalid_digest", path);
    return value;
  },

  /** A distinct list of ids. */
  ids(value: unknown, path: string, max: number): string[] {
    const list = automationStudioProjectJsonShape.array(value, path, max).map((item, index) => automationStudioProjectJsonShape.id(item, `${path}.${index}`));
    if (new Set(list).size !== list.length) return automationStudioProjectJsonShape.refuse("project.duplicate", path);
    return list;
  },

  oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) return automationStudioProjectJsonShape.refuse("project.invalid_choice", path);
    return value as T;
  },

  /** A finite number of at least `min`. */
  amount(value: unknown, path: string, min = 0): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min) return automationStudioProjectJsonShape.refuse("project.invalid_amount", path);
    return value;
  },

  count(value: unknown, path: string, min = 0): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) return automationStudioProjectJsonShape.refuse("project.invalid_count", path);
    return value;
  },

  /** JSON data with no accessors, symbols, cycles or non-plain objects, copied. */
  json(value: unknown, path: string, depth = 0): unknown {
    if (depth > 32) return automationStudioProjectJsonShape.refuse("project.too_deep", path);
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : automationStudioProjectJsonShape.refuse("project.not_json", path);
    if (Array.isArray(value)) return value.map((item, index) => automationStudioProjectJsonShape.json(item, `${path}.${index}`, depth + 1));
    if (typeof value !== "object") return automationStudioProjectJsonShape.refuse("project.not_json", path);
    const fields = automationStudioProjectJsonShape.object(value, path, [], Object.keys(value));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(fields)) out[key] = automationStudioProjectJsonShape.json(item, `${path}.${key}`, depth + 1);
    return out;
  }
});
