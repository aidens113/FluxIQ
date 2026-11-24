// The earlier rounds' calls, fitted to their share of the model's window (t1014): the oldest raw evidence is summarised,
// never dropped.
//
// What each call found, oldest first, is replaced in its own place by `core.summarised`, saying what it held in counts
// and never its content; then, oldest first, what each was asked. Every call keeps its number, what ran, its outcome and
// where it was, so a summarised call still says it happened and how it ended. Where everything fits, nothing is touched.
// The judge's shorter forms work the same way (`../../../../../runtime/result-verification/run-trail/fitting.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

const SUMMARISED_KEY = "core.summarised";

/** `entries` with the oldest members summarised until their JSON fits `budgetBytes`, and how many were. */
export function automationStudioAnswerFirstEarlierFitted(entries: readonly JsonObject[], budgetBytes: number): { entries: JsonObject[]; summarised: number } {
  const fitted = entries.map((entry) => ({ ...entry }));
  const sizes = fitted.map(bytes);
  let total = sizes.reduce((sum, size) => sum + size, 0);
  let summarised = 0;
  for (const member of ["found", "asked"] as const) {
    for (let index = 0; index < fitted.length && total > budgetBytes; index += 1) {
      const entry = fitted[index]!;
      const original = entry[member];
      if (original === undefined) continue;
      const placeholder: JsonObject = { [SUMMARISED_KEY]: { item: member, characters: JSON.stringify(original).length, ...counted(original) } };
      if (JSON.stringify(placeholder).length >= JSON.stringify(original).length) continue;
      entry[member] = placeholder;
      const size = bytes(entry);
      total += size - sizes[index]!;
      sizes[index] = size;
      summarised += 1;
    }
  }
  return { entries: fitted, summarised };
}

function bytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function counted(value: JsonValue): JsonObject {
  if (Array.isArray(value)) return { kind: "list", entries: value.length };
  if (typeof value === "string") return { kind: "text" };
  if (value !== null && typeof value === "object") return { kind: "object", keys: Object.keys(value), ...rowsOf(value) };
  return { kind: value === null ? "null" : typeof value };
}

/** Where an object holds lists one level down (a read's rows under its holder), how many each held: a count, never a row. */
function rowsOf(value: JsonObject): JsonObject {
  const lists: JsonObject = {};
  for (const [key, member] of Object.entries(value)) {
    if (Array.isArray(member)) lists[key] = member.length;
    else if (member !== null && typeof member === "object") {
      for (const [inner, held] of Object.entries(member)) if (Array.isArray(held)) lists[`${key}.${inner}`] = held.length;
    }
  }
  return Object.keys(lists).length ? { lists } : {};
}
