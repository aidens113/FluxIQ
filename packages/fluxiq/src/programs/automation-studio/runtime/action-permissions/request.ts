// The request a run carries out to a person when it needed to do something it
// was not allowed to.
//
// **It ends the run; it does not park it.** The run stops with this request
// in hand, FluxIQ asks the person, and a later run carries their answer as the
// `permittedConsequences` of an ordinary execution grant. There is no pending
// request store and no resumable run, deliberately (the user's decision). But
// the payload is written so that parking can be added without changing it:
// `requestId` is the key a store would hold it under, and nothing in it
// assumes the run has already ended -- no "ended", no outcome, no run state.
// The run's own record says where it was asked from, so the request does not
// repeat the project, Flow or run it travels inside.
//
// **Enough to act on, and nothing past the evidence boundary.** A person can
// grant or refuse from this alone: what the run was about to do, to what, the
// consequences that would have, which of those it lacked, and why it wanted to.
// The control's name is carried only when it appeared in evidence the model had
// already been shown (`gate.ts`), so a request never takes out of the domain
// anything a model request had not already taken out.

import {
  AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES,
  automationStudioConsequencesInOrder,
  isAutomationStudioActionConsequence,
  type AutomationStudioActionConsequence
} from "./consequences.ts";

export const AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION = "automation-studio.action-permission-request.v1";

/** Where in the improvement loop the run was when it needed permission. */
export type AutomationStudioActionPermissionStage = "authoring" | "recovery";

/**
 * When the action would happen, which is the difference a person most needs:
 *
 * - `exploration_step` -- the run wanted to take it now, while finding out how
 *   to do the job. `id` is the option it called, `ref` the call.
 * - `flow_step` -- the Flow would take it every time it runs: the Flow being
 *   built, or, at `recovery`, the Flow a repair would change. `id` is the
 *   step's node definition, `ref` the step's key in the plan or, for a repair,
 *   the node that failed.
 */
export type AutomationStudioActionPermissionActionKind = "exploration_step" | "flow_step";

/** The action a request is about, as Core names it. */
export type AutomationStudioActionPermissionAction = {
  kind: AutomationStudioActionPermissionActionKind;
  id: string;
  ref: string;
};

export type AutomationStudioActionPermissionRequest = {
  schemaVersion: typeof AUTOMATION_STUDIO_ACTION_PERMISSION_REQUEST_SCHEMA_VERSION;
  /** Stable for the life of the request: what a store would hold it under. */
  requestId: string;
  requestedAtMs: number;
  /** The action: when it would happen, what would do it, which one, and the domain's verb for it. */
  action: { kind: AutomationStudioActionPermissionActionKind; id: string; ref: string; verb: string };
  /** What the action acts on, as a person would recognise it. `name` is null when it could not be carried. */
  control: { name: string | null; kind: string | null };
  /** Every lasting consequence the domain declared for the action, in Core's order. */
  consequences: AutomationStudioActionConsequence[];
  /** Those the run was not permitted: exactly what a later run's grant must add. Never empty. */
  missing: AutomationStudioActionConsequence[];
  /** Why the run wanted it: what it was doing, and the instructions it was carrying out. */
  reason: { stage: AutomationStudioActionPermissionStage; instructionIds: string[] };
  /**
   * What the run already held, and why: the classes a grant gave it, and the
   * classes the person's own instruction asked for, each with their words.
   * `missing` is what neither covers.
   */
  authority: {
    granted: AutomationStudioActionConsequence[];
    instructed: Array<{ consequence: AutomationStudioActionConsequence; instructionId: string; quote: string }>;
  };
  /** Core's own sentence for the person being asked. Never a model's. */
  sentence: string;
};

/** The longest control name a request carries. Past it the name is cut, never widened. */
export const AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX = 120;

const ID = /^[A-Za-z0-9._:-]{1,200}$/;
const VERB = /^[a-z]{2,20}(?: [a-z]{2,20})?$/;
const KIND = /^[a-z][a-z -]{0,31}$/;
const MAX_INSTRUCTION_IDS = 100;
const MAX_SENTENCE = 800;

/** Core's sentence for a request, built only from what the request carries. */
export function automationStudioActionPermissionSentence(input: {
  stage: AutomationStudioActionPermissionStage;
  kind: AutomationStudioActionPermissionActionKind;
  verb: string;
  controlName: string | null;
  controlKind: string | null;
  missing: readonly AutomationStudioActionConsequence[];
}): string {
  const target = input.controlName === null ? "a control it cannot name here" : `"${input.controlName}"`;
  const kind = input.controlKind === null ? "" : ` (${input.controlKind})`;
  const phrases = automationStudioConsequencesInOrder(input.missing).map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  const would = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}` : phrases[0] ?? "";
  if (input.kind === "flow_step" && input.stage === "recovery") {
    return `To repair the step that failed, the Flow would ${input.verb} ${target}${kind} each time it runs, which would ${would}. Neither its instruction nor a grant allows that, so the repair stopped to ask.`;
  }
  if (input.kind === "flow_step") {
    return `The Flow its instruction describes would ${input.verb} ${target}${kind} each time it runs, which would ${would}. Neither its instruction nor a grant allows that, so the build stopped to ask.`;
  }
  const doing = input.stage === "authoring" ? "To build the Flow its instruction describes" : "To recover the step that failed";
  return `${doing}, the run needed to ${input.verb} ${target}${kind}, which would ${would}. Neither its instruction nor a grant allows that, so it stopped to ask.`;
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
  // What the run held is never also what it lacked.
  if (missing.some((consequence) => granted.includes(consequence) || instructed.some((entry) => entry.consequence === consequence))) return null;
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

/** Whether a name is one a request may carry: plain, bounded, and nothing markup could hide in. */
export function isAutomationStudioActionPermissionCarriedName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= AUTOMATION_STUDIO_ACTION_PERMISSION_CONTROL_NAME_MAX
    && value === value.trim() && !/[\u0000-\u001f\u007f<>]/u.test(value);
}

const isCarriedName = isAutomationStudioActionPermissionCarriedName;

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
