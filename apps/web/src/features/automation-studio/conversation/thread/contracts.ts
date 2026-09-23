// The conversation as it arrives from Core, and the strict reading of it.
//
// A turn is the one place FluxIQ's words reach a person, so nothing renders
// that Core did not build. Every record is read key by key: an unknown field,
// an unknown enum value, a control character in text, or an over-long string
// refuses that record rather than rendering a narrower version of it. That is
// the rule `parseAutomationStudioActionPermissionRequest` already applies to
// the permission payload, and a conversation carries the same weight.
//
// The shapes are the contract fixed in the conversations plan before this task
// and the API task were dispatched in parallel. They are not negotiated here.

import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES } from "fluxiq/automation-studio/action-permissions";

/**
 * The consequence classes, taken from the exhaustive phrase map Core exports
 * to browsers. The union itself is not on that browser-safe barrel, and the
 * barrel belongs to another task, so it is derived here rather than widened
 * there: a class added in Core lands in this union with no edit at all.
 */
export type AutomationStudioActionConsequence = keyof typeof AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES;

export type ConversationSubjectKind = "project" | "flow" | "build" | "run";
export type ConversationStatus = "open" | "resolved";
export type ConversationTurnAuthor = "automation" | "person";
export type ConversationAskKind = "permission" | "choice" | "confirm" | "open";
export type ConversationAskStatus = "pending" | "answered" | "expired";
export type ConversationAskTimeoutFate = "deny" | "default";
export type ConversationAnswerKind = "grant" | "deny" | "choice" | "text";

/** Something the panel renders itself: a Flow graph diff, a dataset preview, a screenshot. */
export type ConversationAttachment = { kind: string; ref: string };

export type ConversationAskOption = {
  optionId: string;
  label: string;
  description: string | null;
  /** Picking it has a lasting effect, so the answer is re-authorized. */
  destructive: boolean;
};

export type ConversationAsk = {
  askId: string;
  kind: ConversationAskKind;
  status: ConversationAskStatus;
  /** The work waits on the answer rather than ending. */
  parks: boolean;
  timeoutMs: number | null;
  onTimeout: ConversationAskTimeoutFate | null;
  options: ConversationAskOption[];
  /** For a permission ask: exactly the consequence classes an answer would grant. */
  missing: AutomationStudioActionConsequence[];
  control: { name: string | null; kind: string | null } | null;
};

export type ConversationTurn = {
  turnId: string;
  conversationId: string;
  author: ConversationTurnAuthor;
  createdAt: number;
  text: string;
  ask: ConversationAsk | null;
  attachment: ConversationAttachment | null;
};

export type Conversation = {
  conversationId: string;
  projectId: string;
  subject: { kind: ConversationSubjectKind; id: string };
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
};

/**
 * What the person sends back. Core stamps `answeredAt` when it writes the
 * answer, so the panel never sends a clock reading of its own.
 */
export type ConversationAnswer =
  | { askId: string; kind: "grant"; consequences: AutomationStudioActionConsequence[] }
  | { askId: string; kind: "deny" }
  | { askId: string; kind: "choice"; optionId: string }
  | { askId: string; kind: "text"; text: string };

/** The longest turn or answer text the panel will render or send. */
export const CONVERSATION_TEXT_MAX = 8_000;

const ID = /^[A-Za-z0-9._:-]{1,200}$/u;
const ATTACHMENT_KIND = /^[a-z][a-z0-9-]{0,39}$/u;
const CONTROL_KIND = /^[a-z][a-z -]{0,31}$/u;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_OPTIONS = 12;
const MAX_LABEL = 200;
const MAX_DESCRIPTION = 600;
const CONSEQUENCES: ReadonlySet<string> = new Set(Object.keys(AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES));

export function parseConversation(value: unknown): Conversation | null {
  if (!isRecord(value) || !allowedFields(value, ["conversationId", "projectId", "subject", "status", "createdAt", "updatedAt"])) return null;
  if (!isId(value.conversationId) || !isId(value.projectId)) return null;
  if (value.status !== "open" && value.status !== "resolved") return null;
  if (!isTimestamp(value.createdAt) || !isTimestamp(value.updatedAt)) return null;
  const subject = value.subject;
  if (!isRecord(subject) || !allowedFields(subject, ["kind", "id"]) || !isId(subject.id)) return null;
  if (subject.kind !== "project" && subject.kind !== "flow" && subject.kind !== "build" && subject.kind !== "run") return null;
  return {
    conversationId: value.conversationId,
    projectId: value.projectId,
    subject: { kind: subject.kind, id: subject.id },
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

export function parseConversationTurn(value: unknown): ConversationTurn | null {
  if (!isRecord(value) || !allowedFields(value, ["turnId", "conversationId", "author", "createdAt", "text", "ask", "attachment"])) return null;
  if (!isId(value.turnId) || !isId(value.conversationId) || !isTimestamp(value.createdAt)) return null;
  if (value.author !== "automation" && value.author !== "person") return null;
  if (!isSafeText(value.text, CONVERSATION_TEXT_MAX)) return null;
  const ask = isAbsent(value.ask) ? null : parseConversationAsk(value.ask);
  if (!isAbsent(value.ask) && !ask) return null;
  const attachment = isAbsent(value.attachment) ? null : parseAttachment(value.attachment);
  if (!isAbsent(value.attachment) && !attachment) return null;
  return {
    turnId: value.turnId,
    conversationId: value.conversationId,
    author: value.author,
    createdAt: value.createdAt,
    text: value.text,
    ask,
    attachment
  };
}

/** Every turn Core built, in the order it sent them; one bad record drops only itself. */
export function parseConversationTurns(value: unknown): ConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const turn = parseConversationTurn(entry);
    return turn ? [turn] : [];
  });
}

/** Every conversation Core built; one bad record drops only itself. */
export function parseConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const conversation = parseConversation(entry);
    return conversation ? [conversation] : [];
  });
}

function parseConversationAsk(value: unknown): ConversationAsk | null {
  if (!isRecord(value) || !allowedFields(value, ["askId", "kind", "status", "parks", "timeoutMs", "onTimeout", "options", "missing", "control"])) return null;
  if (!isId(value.askId) || typeof value.parks !== "boolean") return null;
  if (value.kind !== "permission" && value.kind !== "choice" && value.kind !== "confirm" && value.kind !== "open") return null;
  if (value.status !== "pending" && value.status !== "answered" && value.status !== "expired") return null;
  if (!isAbsent(value.timeoutMs) && !isTimestamp(value.timeoutMs)) return null;
  if (!isAbsent(value.onTimeout) && value.onTimeout !== "deny" && value.onTimeout !== "default") return null;
  const options = parseOptions(value.options);
  const missing = parseConsequences(value.missing);
  const control = parseControl(value.control);
  if (!options || !missing || control === undefined) return null;
  return {
    askId: value.askId,
    kind: value.kind,
    status: value.status,
    parks: value.parks,
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : null,
    onTimeout: value.onTimeout === "deny" || value.onTimeout === "default" ? value.onTimeout : null,
    options,
    missing,
    control
  };
}

function parseOptions(value: unknown): ConversationAskOption[] | null {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value) || value.length > MAX_OPTIONS) return null;
  const options: ConversationAskOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !allowedFields(entry, ["optionId", "label", "description", "destructive"])) return null;
    if (!isId(entry.optionId) || !isSafeText(entry.label, MAX_LABEL) || !entry.label.trim()) return null;
    if (!isAbsent(entry.description) && !isSafeText(entry.description, MAX_DESCRIPTION)) return null;
    if (entry.destructive !== undefined && typeof entry.destructive !== "boolean") return null;
    options.push({
      optionId: entry.optionId,
      label: entry.label,
      description: typeof entry.description === "string" ? entry.description : null,
      destructive: entry.destructive === true
    });
  }
  return options;
}

function parseConsequences(value: unknown): AutomationStudioActionConsequence[] | null {
  if (isAbsent(value)) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && CONSEQUENCES.has(entry))) return null;
  return [...new Set(value)] as AutomationStudioActionConsequence[];
}

/** `undefined` means the record was malformed; `null` means it carried no control. */
function parseControl(value: unknown): ConversationAsk["control"] | undefined {
  if (isAbsent(value)) return null;
  if (!isRecord(value) || !allowedFields(value, ["name", "kind"])) return undefined;
  if (value.name !== null && value.name !== undefined && !isSafeText(value.name, MAX_LABEL)) return undefined;
  if (value.kind !== null && value.kind !== undefined && (typeof value.kind !== "string" || !CONTROL_KIND.test(value.kind))) return undefined;
  return {
    name: typeof value.name === "string" ? value.name : null,
    kind: typeof value.kind === "string" ? value.kind : null
  };
}

function parseAttachment(value: unknown): ConversationAttachment | null {
  if (!isRecord(value) || !allowedFields(value, ["kind", "ref"])) return null;
  if (typeof value.kind !== "string" || !ATTACHMENT_KIND.test(value.kind) || !isId(value.ref)) return null;
  return { kind: value.kind, ref: value.ref };
}

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowedFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every((key) => fields.includes(key));
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSafeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !UNSAFE_TEXT.test(value);
}
