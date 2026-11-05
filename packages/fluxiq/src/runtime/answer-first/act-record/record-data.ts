// Reading an act record back (plan D6). It decides what a later run may leave
// undone, so an unknown key or a wrong type is refused, never taken in part: the
// caller is told it could not be read and decides what that means.

import { parseAutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { AutomationStudioAttemptActEntry, AutomationStudioAttemptActNotedRow, AutomationStudioAttemptActRecordData } from "./contracts.ts";

const RECORD_KEYS: ReadonlySet<string> = new Set(["kind", "schemaVersion", "acts", "rows", "place"]);
const ENTRY_KEYS: ReadonlySet<string> = new Set(["id", "what", "where", "classes", "state", "rowIdentity", "undo", "undeclared", "stage", "actions", "keys", "handleKeys", "rows", "controls", "fingerprinted", "listBefore", "unmarked", "steps", "lookedSince", "at", "actedOnWords", "placePath", "asked", "landings"]);
const CONTRACT_KEYS: ReadonlySet<string> = new Set(["id", "what", "where", "classes", "state", "rowIdentity", "undo"]);
const ROW_KEYS: ReadonlySet<string> = new Set(["row", "handles", "fields", "paths", "commonPaths", "reads"]);
const FIELD_KEYS: ReadonlySet<string> = new Set(["words", "lettered", "common"]);
const PLACE_KEYS: ReadonlySet<string> = new Set(["rows", "path"]);
const STAGES: ReadonlySet<unknown> = new Set(["exploration", "forward", "trial", "run"]);

export type AutomationStudioAttemptActRecordDataRead = { ok: true; data: AutomationStudioAttemptActRecordData } | { ok: false; issues: string[] };

/** Parses persisted data strictly, returning fresh objects (header). Issues are stable codes prefixed `act_record.`. */
export function parseAutomationStudioAttemptActRecordData(value: unknown): AutomationStudioAttemptActRecordDataRead {
  const issues = new Set<string>();
  if (!isRecord(value)) return { ok: false, issues: ["act_record.not_object"] };
  if (!onlyKeys(value, RECORD_KEYS)) issues.add("act_record.unknown_key");
  if (value.kind !== "attempt_act_record") issues.add("act_record.invalid_kind");
  if (value.schemaVersion !== 1) issues.add("act_record.invalid_version");
  if (!Array.isArray(value.acts) || !value.acts.every((entry) => entryRead(entry, issues))) issues.add("act_record.invalid_acts");
  if (!Array.isArray(value.rows) || !value.rows.every(rowRead)) issues.add("act_record.invalid_rows");
  if (value.place !== undefined && !placeRead(value.place)) issues.add("act_record.invalid_place");
  return issues.size > 0 ? { ok: false, issues: [...issues] } : { ok: true, data: structuredClone(value) as unknown as AutomationStudioAttemptActRecordData };
}

function entryRead(value: unknown, issues: Set<string>): value is AutomationStudioAttemptActEntry {
  if (!isRecord(value) || !onlyKeys(value, ENTRY_KEYS)) return false;
  const contract = Object.fromEntries(Object.entries(value).filter(([key]) => CONTRACT_KEYS.has(key)));
  const act = parseAutomationStudioAttemptAct(contract);
  if (!act.ok) {
    for (const issue of act.issues) issues.add(issue);
    return false;
  }
  return STAGES.has(value.stage) && strings(value.actions) && strings(value.keys) && strings(value.handleKeys) && strings(value.rows)
    && typeof value.lookedSince === "boolean" && typeof value.at === "number" && Number.isFinite(value.at)
    && (value.undeclared === undefined || value.undeclared === true)
    && (value.fingerprinted === undefined || value.fingerprinted === true) && (value.listBefore === undefined || strings(value.listBefore)) && (value.unmarked === undefined || value.unmarked === true)
    && (value.controls === undefined || strings(value.controls)) && (value.placePath === undefined || typeof value.placePath === "string")
    && (value.steps === undefined || strings(value.steps)) && (value.actedOnWords === undefined || strings(value.actedOnWords))
    && (value.asked === undefined || (Number.isSafeInteger(value.asked) && (value.asked as number) >= 2))
    && (value.landings === undefined || (Number.isSafeInteger(value.landings) && (value.landings as number) >= 0));
}

function rowRead(value: unknown): value is AutomationStudioAttemptActNotedRow {
  return isRecord(value) && onlyKeys(value, ROW_KEYS) && typeof value.row === "string" && strings(value.handles) && strings(value.paths)
    && (value.commonPaths === undefined || strings(value.commonPaths))
    && (value.reads === undefined || (Array.isArray(value.reads) && value.reads.every((read) => Number.isSafeInteger(read))))
    && Array.isArray(value.fields) && value.fields.every((field) => isRecord(field) && onlyKeys(field, FIELD_KEYS) && strings(field.words) && strings(field.lettered) && (field.common === undefined || field.common === true));
}

function placeRead(value: unknown): boolean {
  return isRecord(value) && onlyKeys(value, PLACE_KEYS) && strings(value.rows) && (value.path === undefined || typeof value.path === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
