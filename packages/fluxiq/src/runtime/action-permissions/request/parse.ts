import { AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION, type AutomationStudioActionPermissionRequest } from "../../../flows/executable/permissions/request/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../consequences.ts";
import { isAutomationStudioActionPermissionCarriedName as isCarriedName } from "./name.ts";

const ID = /^[A-Za-z0-9._:-]{1,200}$/;

const VERB = /^[a-z]{2,20}(?: [a-z]{2,20})?$/;

const KIND = /^[a-z][a-z -]{0,31}$/;

const MAX_INSTRUCTION_IDS = 100;

const MAX_SENTENCE = 800;

function consequenceList(value: unknown): AutomationStudioActionConsequence[] | null {
  if (!Array.isArray(value) || !value.length || !value.every(isAutomationStudioActionConsequence)) return null;
  const ordered = automationStudioConsequencesInOrder(value);
  return ordered.length === value.length && ordered.every((consequence, index) => consequence === value[index]) ? ordered : null;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

/**
 * A request read back from the wire or a stored record, or `null`.
 *
 * Strict in every field, because what reaches a person must be exactly what
 * Core built: an unknown field, an unknown consequence, a missing class the
 * action never declared, or a name that could carry markup all refuse it.
 * Built key by key, so a renamed field is a compile error rather than a
 * silently narrower request.
 */
export function parseAutomationStudioActionPermissionRequest(value: unknown): AutomationStudioActionPermissionRequest | null {
  if (!isRecord(value) || !exactFields(value, ["schemaVersion", "requestId", "requestedAtMs", "action", "control", "consequences", "missing", "reason", "authority", "sentence"])) return null;
  if (value.schemaVersion !== AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION) return null;
  if (!isId(value.requestId) || !Number.isSafeInteger(value.requestedAtMs) || (value.requestedAtMs as number) < 0) return null;
  const action = value.action;
  if (!isRecord(action) || !exactFields(action, ["kind", "id", "ref", "verb"]) || (action.kind !== "exploration_step" && action.kind !== "flow_step")
    || !isId(action.id) || !isId(action.ref) || typeof action.verb !== "string" || !VERB.test(action.verb)) return null;
  const control = value.control;
  if (!isRecord(control) || !exactFields(control, ["name", "kind"])) return null;
  if (control.name !== null && !isCarriedName(control.name)) return null;
  if (control.kind !== null && (typeof control.kind !== "string" || !KIND.test(control.kind))) return null;
  const consequences = consequenceList(value.consequences);
  const missing = consequenceList(value.missing);
  if (!consequences || !missing || !missing.every((consequence) => consequences.includes(consequence))) return null;
  const reason = value.reason;
  if (!isRecord(reason) || !exactFields(reason, ["stage", "instructionIds"]) || (reason.stage !== "authoring" && reason.stage !== "recovery")
    || !Array.isArray(reason.instructionIds) || reason.instructionIds.length > MAX_INSTRUCTION_IDS || !reason.instructionIds.every(isId)) return null;
  if (typeof value.sentence !== "string" || !value.sentence.length || value.sentence.length > MAX_SENTENCE || /[\u0000-\u001f\u007f]/u.test(value.sentence)) return null;
  const authority = value.authority;
  if (!isRecord(authority) || !exactFields(authority, ["granted", "instructed"]) || !Array.isArray(authority.granted) || !Array.isArray(authority.instructed)) return null;
  const granted = authority.granted.length ? consequenceList(authority.granted) : [];
  if (!granted) return null;
  const instructed: AutomationStudioActionPermissionRequest["authority"]["instructed"] = [];
  for (const entry of authority.instructed) {
    if (!isRecord(entry) || !exactFields(entry, ["consequence", "instructionId", "quote"]) || !isAutomationStudioActionConsequence(entry.consequence)
      || !isId(entry.instructionId) || typeof entry.quote !== "string" || !entry.quote.length || entry.quote.length > 300) return null;
    instructed.push({ consequence: entry.consequence, instructionId: entry.instructionId, quote: entry.quote });
  }
  // What the run was granted is never also what it lacked. An instructed class
  // can be: since 2026-09-30 the instruction does not stand in for a person's
  // permission on moving money, deleting, or sending or publishing.
  if (missing.some((consequence) => granted.includes(consequence))) return null;
  return {
    schemaVersion: AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION,
    requestId: value.requestId as string,
    requestedAtMs: value.requestedAtMs as number,
    action: { kind: action.kind, id: action.id as string, ref: action.ref as string, verb: action.verb },
    control: { name: control.name as string | null, kind: control.kind as string | null },
    consequences,
    missing,
    reason: { stage: reason.stage, instructionIds: [...reason.instructionIds as string[]] },
    authority: { granted, instructed },
    sentence: value.sentence
  };
}
