import { isJsonObject, isJsonValue } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioResultEvidenceBundle } from "../../../../../runtime/result-verification/index.ts";

/** Validate every member of the existing typed bundle. Partial page parsing is not proof that the remaining persisted metadata is readable. */
export function readAutomationStudioAnswerFirstResultEvidence(value: unknown): AutomationStudioResultEvidenceBundle | undefined {
  if (!shape(value, ["pages", "coverage", "working", "looks"], ["answerContract", "processing", "missingEvidence"])) return undefined;
  if (!list(value.pages, page) || !list(value.looks, page) || !list(value.coverage, coverage) || !list(value.working, working)) return undefined;
  if (value.answerContract !== undefined && !(shape(value.answerContract, ["columns"]) && list(value.answerContract.columns, identity))) return undefined;
  if (value.processing !== undefined && !processing(value.processing)) return undefined;
  if (value.missingEvidence !== undefined && !list(value.missingEvidence, (entry) => shape(entry, ["datasetId"], ["batchKey"]) && identity(entry.datasetId) && optional(entry, "batchKey", identity))) return undefined;
  const copied = structuredClone(value) as unknown as AutomationStudioResultEvidenceBundle;
  // JSON represents a deliberately unknown found[i] as null. Decode only this declared optional reading; no row, condition or fabricated annotation is dropped.
  for (const page of [...copied.pages, ...copied.looks]) if (page.leftOut && "found" in page.leftOut && Array.isArray(page.leftOut.found)) page.leftOut.found = page.leftOut.found.map((found) => found === null ? undefined : found);
  return copied;
}

function shape(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  return required.every((key) => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every((key) => typeof key === "string" && (required.includes(key) || optional.includes(key)));
}

function optional(record: Record<string, unknown>, key: string, test: (value: unknown) => boolean): boolean {
  return !Object.hasOwn(record, key) || test(record[key]);
}
function list(value: unknown, test: (value: unknown) => boolean): value is unknown[] {
  return Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index) && test(value[index])).every(Boolean);
}
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): boolean => count(value) && value > 0;
const text = (value: unknown): value is string => typeof value === "string";
const identity = (value: unknown): boolean => text(value) && value.trim().length > 0;

function page(value: unknown): boolean {
  return shape(value, ["source", "step", "version", "conditions", "fields", "kept", "rows"], ["datasetId", "position", "listKey", "where", "place", "leftOut", "carried", "invalidCount"])
    && identity(value.source) && identity(value.step) && positive(value.version) && list(value.conditions, isJsonValue) && isJsonObject(value.fields)
    && count(value.kept) && list(value.rows, isJsonObject) && value.kept === value.rows.length
    && optional(value, "datasetId", identity) && optional(value, "position", positive) && optional(value, "listKey", text) && optional(value, "where", text) && optional(value, "place", text)
    && optional(value, "carried", (entry) => typeof entry === "boolean") && optional(value, "leftOut", leftOut) && optional(value, "invalidCount", count);
}

function coverage(value: unknown): boolean {
  if (!shape(value, ["step", "version", "places", "first"], ["last"]) || !identity(value.step) || !positive(value.version) || !list(value.places, text) || !text(value.first) || !["read", "not read", "unknown"].includes(value.first)) return false;
  if (value.last === undefined) return !Object.hasOwn(value, "last");
  return shape(value.last, ["place"], ["paging"]) && text(value.last.place) && optional(value.last, "paging", (paging) =>
    shape(paging, ["verdict"]) && paging.verdict === "moved" || shape(paging, ["verdict", "reason"]) && paging.verdict === "ended" && text(paging.reason));
}

function working(value: unknown): boolean {
  return shape(value, ["step", "kept"], ["position", "listKey"]) && identity(value.step) && count(value.kept) && optional(value, "position", positive) && optional(value, "listKey", text);
}

function leftOut(value: unknown): boolean {
  if (shape(value, ["reported"], ["parameters"])) return isJsonObject(value.reported) && optional(value, "parameters", isJsonObject);
  return shape(value, ["sets"], ["where", "columns", "found"])
    && list(value.sets, (set) => shape(set, ["kind", "conditions", "rows"]) && text(set.kind) && ["alone", "together", "unsplit"].includes(set.kind) && list(set.conditions, count) && list(set.rows, isJsonObject))
    && optional(value, "where", (where) => list(where, isJsonValue)) && optional(value, "columns", isJsonObject)
    && optional(value, "found", (found) => list(found, (entry) => entry === null || entry === undefined || list(entry, text)));
}

function processing(value: unknown): boolean {
  if (!shape(value, ["declared", "collected", "leftOut", "repeats", "cut", "kept", "filters"]) || !isJsonObject(value.declared)) return false;
  if (![value.collected, value.leftOut, value.repeats, value.cut, value.kept].every(count)) return false;
  if ((value.collected as number) - (value.leftOut as number) - (value.repeats as number) - (value.cut as number) !== value.kept) return false;
  return list(value.filters, (filter) => shape(filter, ["condition", "leftOut", "leftOutOnlyByThis"]) && text(filter.condition) && count(filter.leftOut) && (filter.leftOut as number) <= (value.collected as number) && list(filter.leftOutOnlyByThis, text));
}
