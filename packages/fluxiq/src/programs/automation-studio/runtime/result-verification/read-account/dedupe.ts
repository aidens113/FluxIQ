// How a read step's authored `dedupe` reads, in every form the downstream
// domain accepts (`domain/src/actions/extraction/order-request.ts` there):
// `true`, `"url"`, `"name, url"`, `["name", "url"]`, `{by: "url"}`,
// `{fields: ["name", "url"]}`, `[{field: "url"}]`, and a lone value as a list
// of one. Restated rather than imported, because Core never imports a domain.
//
// Until live run `run-muqk713g` the account read a dedupe only as an object or
// `true`, so `dedupe: "url"` -- which the read honoured -- reached every judge
// as no dedupe at all, and its key was lost.
//
// What the domain reads as no dedupe is none here: `false`, `null`, an empty
// list, an off word, and a value that is not a dedupe at all (a number, an
// object of foreign keys), which the domain refuses. A dedupe naming no column,
// or only columns that are not ids, still dedupes: by the domain's default key,
// which this side does not name.

import type { JsonObject } from "../../../../../core/index.ts";

/** The keys a dedupe object names its columns under (the domain's `DEDUPE_KEYS`). */
const DEDUPE_KEYS = ["by", "field", "fields", "column", "columns", "key", "keys", "on"] as const;
/** The keys a list entry names its column under (the domain's `FIELD_KEYS`). */
const FIELD_KEYS = ["field", "by", "column", "key", "name", "on"] as const;
const ON_WORDS: ReadonlySet<string> = new Set(["true", "yes", "on", "auto", "default", "once", "unique"]);
const OFF_WORDS: ReadonlySet<string> = new Set(["false", "no", "off", "none"]);

/**
 * Whether `value` asks for a dedupe, and the column names it gives, each as the
 * step's own column where one matches it ignoring case. `by` is empty for a
 * dedupe by the default key. The names are as authored: the caller holds them
 * to the id rule and the declared keys before saying any.
 */
export function automationStudioResultReadDedupe(value: unknown, columns: readonly string[]): { dedupes: boolean; by: string[] } {
  const written = dedupeColumns(value);
  if (written === undefined) return { dedupes: false, by: [] };
  const named = written.map((name) => columns.find((column) => column.toLowerCase() === name.toLowerCase()) ?? name);
  return { dedupes: true, by: [...new Set(named)] };
}

/** The column names a dedupe names, `[]` for the default key, or `undefined` for no dedupe. */
function dedupeColumns(value: unknown): string[] | undefined {
  const only = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (only === undefined || only === null || only === false) return undefined;
  if (Array.isArray(only)) {
    const names = only.flatMap((entry) => (typeof entry === "string" ? splitNames(entry) : isRecord(entry) ? namesIn(entry) : []));
    return names.length > 0 ? names : undefined;
  }
  if (only === true) return [];
  if (typeof only === "string") {
    const word = only.trim().toLowerCase();
    if (OFF_WORDS.has(word)) return undefined;
    return word === "" || ON_WORDS.has(word) ? [] : splitNames(only);
  }
  if (isRecord(only)) {
    if (Object.keys(only).length === 0) return [];
    const by = DEDUPE_KEYS.map((key) => only[key]).find((entry) => entry !== undefined);
    return by === undefined ? undefined : dedupeColumns(by);
  }
  return undefined;
}

/** The names under a list entry's own naming key. */
function namesIn(entry: JsonObject): string[] {
  const named = FIELD_KEYS.map((key) => entry[key]).find((value) => typeof value === "string");
  return typeof named === "string" ? splitNames(named) : [];
}

function splitNames(text: string): string[] {
  return text.split(/\s*[,+&]\s*|\s+and\s+/u).map((name) => name.trim()).filter(Boolean);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
