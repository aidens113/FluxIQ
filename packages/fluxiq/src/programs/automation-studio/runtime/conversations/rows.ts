// The SQL rows a conversation is stored as, and the one-way map back to the
// model. Nothing here talks to the database: it is the boundary where a row
// becomes something the rest of Core may hold, so every field is read by name
// and a stored value that does not parse fails the read rather than arriving
// as a narrower turn than the one that was written.

import {
  isAutomationStudioActionConsequence,
  parseAutomationStudioActionPermissionRequest,
  type AutomationStudioActionConsequence,
  type AutomationStudioActionPermissionRequest
} from "../action-permissions/index.ts";
import {
  type AutomationStudioConversationAnswerKind,
  type AutomationStudioConversationAsk,
  type AutomationStudioConversationAskControl,
  type AutomationStudioConversationAskKind,
  type AutomationStudioConversationAskOption,
  type AutomationStudioConversationAskRoutes,
  type AutomationStudioConversationAskStatus,
  type AutomationStudioConversationAskTimeoutAction
} from "./ask.ts";
import type { AutomationStudioConversation, AutomationStudioConversationStatus, AutomationStudioConversationSubjectKind } from "./thread.ts";
import type { AutomationStudioConversationAuthor, AutomationStudioConversationTurn } from "./turn.ts";

export type AutomationStudioConversationRow = {
  conversation_id: string;
  subject_kind: AutomationStudioConversationSubjectKind;
  subject_id: string;
  status: AutomationStudioConversationStatus;
  title: string | null;
  revision: number;
  turn_count: number;
  pending_ask_count: number;
  created_at_ms: number;
  updated_at_ms: number;
};

export type AutomationStudioConversationTurnRow = {
  conversation_id: string;
  turn_id: string;
  ordinal: number;
  author: AutomationStudioConversationAuthor;
  body: string;
  attachment_kind: string | null;
  attachment_ref: string | null;
  actor_id: string | null;
  created_at_ms: number;
};

export type AutomationStudioConversationAskRow = {
  ask_id: string;
  conversation_id: string;
  turn_id: string;
  kind: AutomationStudioConversationAskKind;
  status: AutomationStudioConversationAskStatus;
  parks: number;
  timeout_ms: number | null;
  on_timeout: AutomationStudioConversationAskTimeoutAction | null;
  options_json: string | null;
  routes_json: string | null;
  consequences_json: string | null;
  missing_json: string | null;
  control_json: string | null;
  request_json: string | null;
  created_at_ms: number;
  answered_at_ms: number | null;
  answer_kind: AutomationStudioConversationAnswerKind | null;
  answer_value: string | null;
  answer_actor_id: string | null;
};

export const AUTOMATION_STUDIO_CONVERSATION_COLUMNS = "conversation_id, subject_kind, subject_id, status, title, revision, turn_count, pending_ask_count, created_at_ms, updated_at_ms";
export const AUTOMATION_STUDIO_CONVERSATION_TURN_COLUMNS = "conversation_id, turn_id, ordinal, author, body, attachment_kind, attachment_ref, actor_id, created_at_ms";
export const AUTOMATION_STUDIO_CONVERSATION_ASK_COLUMNS =
  "ask_id, conversation_id, turn_id, kind, status, parks, timeout_ms, on_timeout, options_json, routes_json, consequences_json, missing_json, control_json, request_json, created_at_ms, answered_at_ms, answer_kind, answer_value, answer_actor_id";

export function automationStudioConversationFromRow(projectId: string, row: AutomationStudioConversationRow): AutomationStudioConversation {
  return {
    conversationId: row.conversation_id,
    projectId,
    subject: { kind: row.subject_kind, id: row.subject_id },
    status: row.status,
    title: row.title,
    revision: row.revision,
    turnCount: row.turn_count,
    pendingAskCount: row.pending_ask_count,
    createdAt: row.created_at_ms,
    updatedAt: row.updated_at_ms
  };
}

export function automationStudioConversationTurnFromRow(row: AutomationStudioConversationTurnRow, ask: AutomationStudioConversationAsk | null): AutomationStudioConversationTurn {
  return {
    turnId: row.turn_id,
    conversationId: row.conversation_id,
    ordinal: row.ordinal,
    author: row.author,
    createdAt: row.created_at_ms,
    text: row.body,
    actorId: row.actor_id,
    ask,
    attachment: row.attachment_kind === null || row.attachment_ref === null ? null : { kind: row.attachment_kind, ref: row.attachment_ref }
  };
}

export function automationStudioConversationAskFromRow(row: AutomationStudioConversationAskRow): AutomationStudioConversationAsk {
  return {
    askId: row.ask_id,
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    kind: row.kind,
    status: row.status,
    parks: row.parks === 1,
    timeoutMs: row.timeout_ms,
    onTimeout: row.on_timeout,
    options: storedOptions(row.options_json),
    routes: storedRoutes(row.routes_json),
    consequences: storedMissing(row.consequences_json),
    missing: storedMissing(row.missing_json),
    control: storedControl(row.control_json),
    permissionRequest: storedPermissionRequest(row.request_json),
    createdAt: row.created_at_ms,
    answer:
      row.answered_at_ms === null || row.answer_kind === null
        ? null
        : { askId: row.ask_id, answeredAt: row.answered_at_ms, kind: row.answer_kind, value: row.answer_value, actorId: row.answer_actor_id }
  };
}

function storedOptions(value: string | null): AutomationStudioConversationAskOption[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Stored conversation ask options are not a list.");
  return parsed.map((entry) => {
    const option = entry as Partial<AutomationStudioConversationAskOption>;
    if (typeof option?.id !== "string" || typeof option?.label !== "string") throw new Error("Stored conversation ask option is not an option.");
    const route = option.route ?? null;
    if (route !== null && typeof route !== "string") throw new Error("Stored conversation ask option route is not a route.");
    return { id: option.id, label: option.label, route };
  });
}

function storedRoutes(value: string | null): AutomationStudioConversationAskRoutes | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Partial<AutomationStudioConversationAskRoutes>;
  const routes = { granted: parsed?.granted ?? null, denied: parsed?.denied ?? null, timedOut: parsed?.timedOut ?? null };
  for (const route of [routes.granted, routes.denied, routes.timedOut]) {
    if (route !== null && typeof route !== "string") throw new Error("Stored conversation ask route is not a route.");
  }
  return routes;
}

function storedMissing(value: string | null): AutomationStudioActionConsequence[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Stored conversation ask consequences are not a list.");
  return parsed.map((entry) => {
    if (!isAutomationStudioActionConsequence(entry)) throw new Error("Stored conversation ask carries an unknown consequence.");
    return entry;
  });
}

function storedControl(value: string | null): AutomationStudioConversationAskControl | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Partial<AutomationStudioConversationAskControl>;
  const name = parsed?.name ?? null;
  const kind = parsed?.kind ?? null;
  if ((name !== null && typeof name !== "string") || (kind !== null && typeof kind !== "string")) throw new Error("Stored conversation ask control is not a control.");
  return { name, kind };
}

function storedPermissionRequest(value: string | null): AutomationStudioActionPermissionRequest | null {
  if (value === null) return null;
  const request = parseAutomationStudioActionPermissionRequest(JSON.parse(value));
  // The write parsed it too, so a failure here is a stored record that changed
  // under Core. A person must never be shown less than Core built, so the read
  // fails rather than serving a request with fields quietly missing.
  if (request === null) throw new Error("Stored conversation ask carries an action-permission request Core cannot read back.");
  return request;
}
