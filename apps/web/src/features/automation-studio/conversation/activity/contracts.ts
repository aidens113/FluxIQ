// Live activity as it arrives from Core's `get-activity`, and the strict
// reading of it.
//
// The shape is `ClientGatewayActivity` (`packages/contracts/src/client-gateway.ts`),
// which the hub in `runtime/activity/` keeps as is. It is restated here rather
// than imported because the web app depends on `fluxiq`, not on the contracts
// package, and the browser-safe barrels do not carry it.
//
// The rule is the thread's (`thread/contracts.ts`): nothing renders that Core
// did not build. An unknown phase, a control character, or a string longer
// than Core's own bound refuses that event rather than rendering a narrower
// version of it. A field this reader does not know is ignored, not fatal, and
// so is a `resolution` it does not know.

export type ConversationActivityPhase =
  | "thinking"
  | "exploring"
  | "building"
  | "running"
  | "extracting"
  | "verifying"
  | "repairing"
  | "waiting_permission"
  | "done"
  | "failed";

export type ConversationActivityDetailKind = "thought" | "tool" | "step" | "check" | "ask" | "note";
export type ConversationActivityDetailStatus = "started" | "succeeded" | "failed";
/** How a wait on the person ended, on the ask row that settles it. */
export type ConversationActivityResolution = "waited_out" | "answered" | "allowed" | "declined" | "timed_out" | "cancelled";

export type ConversationActivityStep = { index: number; count: number; nodeId?: string; label?: string };

export type ConversationActivityDetail = {
  kind: ConversationActivityDetailKind;
  title: string;
  text?: string;
  status?: ConversationActivityDetailStatus;
  /** Tool or node id the row describes; an ask row's ask id. */
  ref?: string;
  /** On the ask row that settles a wait: how it ended. The card is marked from this row alone. */
  resolution?: ConversationActivityResolution;
};

export type ConversationActivity = {
  activityId: string;
  /** Strictly increasing per Core process; the key a reader orders and deduplicates by. */
  sequence: number;
  subject: { kind: "build" | "run"; id: string; projectId: string; flowId?: string };
  phase: ConversationActivityPhase;
  /** Core's own one-line status sentence. */
  label: string;
  step?: ConversationActivityStep;
  detail?: ConversationActivityDetail;
  conversationId?: string;
  final?: boolean;
  /** ISO timestamp, as Core stamped it. */
  at: string;
  /** `at` in epoch milliseconds, read once so the thread can order by it. */
  atMs: number;
};

export type ConversationActivitySnapshot = { current: ConversationActivity | null; recent: ConversationActivity[] };

const PHASES: readonly string[] = ["thinking", "exploring", "building", "running", "extracting", "verifying", "repairing", "waiting_permission", "done", "failed"];
const DETAIL_KINDS: readonly string[] = ["thought", "tool", "step", "check", "ask", "note"];
const DETAIL_STATUSES: readonly string[] = ["started", "succeeded", "failed"];
const RESOLUTIONS: readonly string[] = ["waited_out", "answered", "allowed", "declined", "timed_out", "cancelled"];

/** Core's bounds (`runtime/activity/limits.ts`); ids are not clipped there, so they get a generous ceiling here. */
const LABEL_MAX = 160;
const TEXT_MAX = 1_000;
const ID_MAX = 512;

const CONTROL = /[\u0000-\u001f\u007f]/u;
const CONTROL_EXCEPT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

/** A snapshot's events, each read on its own: one bad event is dropped, not the snapshot. */
export function parseConversationActivitySnapshot(value: unknown): ConversationActivitySnapshot {
  const record = asRecord(value);
  const recent = Array.isArray(record?.recent)
    ? record.recent.map(parseActivity).filter((event): event is ConversationActivity => event !== null)
    : [];
  return { current: parseActivity(record?.current), recent };
}

function parseActivity(value: unknown): ConversationActivity | null {
  const record = asRecord(value);
  if (!record) return null;
  const subject = asRecord(record.subject);
  const activityId = text(record.activityId, ID_MAX);
  const label = text(record.label, LABEL_MAX);
  const at = text(record.at, 64);
  const atMs = at === null ? Number.NaN : Date.parse(at);
  if (activityId === null || label === null || at === null || !Number.isFinite(atMs)) return null;
  if (typeof record.sequence !== "number" || !Number.isFinite(record.sequence)) return null;
  if (typeof record.phase !== "string" || !PHASES.includes(record.phase)) return null;
  if (!subject || (subject.kind !== "build" && subject.kind !== "run")) return null;
  const subjectId = text(subject.id, ID_MAX);
  const projectId = text(subject.projectId, ID_MAX);
  if (subjectId === null || projectId === null) return null;
  const flowId = optional(subject.flowId, (entry) => text(entry, ID_MAX));
  const step = optional(record.step, parseStep);
  const detail = optional(record.detail, parseDetail);
  const conversationId = optional(record.conversationId, (entry) => text(entry, ID_MAX));
  if (flowId === null || step === null || detail === null || conversationId === null) return null;
  if (record.final !== undefined && typeof record.final !== "boolean") return null;
  return {
    activityId,
    sequence: record.sequence,
    subject: { kind: subject.kind, id: subjectId, projectId, ...(flowId === undefined ? {} : { flowId }) },
    phase: record.phase as ConversationActivityPhase,
    label,
    ...(step === undefined ? {} : { step }),
    ...(detail === undefined ? {} : { detail }),
    ...(conversationId === undefined ? {} : { conversationId }),
    ...(record.final === true ? { final: true } : {}),
    at,
    atMs
  };
}

function parseStep(value: unknown): ConversationActivityStep | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.index !== "number" || !Number.isInteger(record.index) || record.index < 1) return null;
  if (typeof record.count !== "number" || !Number.isFinite(record.count)) return null;
  const nodeId = optional(record.nodeId, (entry) => text(entry, ID_MAX));
  const label = optional(record.label, (entry) => text(entry, LABEL_MAX));
  if (nodeId === null || label === null) return null;
  return {
    index: record.index,
    count: record.count,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(label === undefined ? {} : { label })
  };
}

function parseDetail(value: unknown): ConversationActivityDetail | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.kind !== "string" || !DETAIL_KINDS.includes(record.kind)) return null;
  const title = text(record.title, LABEL_MAX);
  const body = optional(record.text, (entry) => text(entry, TEXT_MAX, true));
  const ref = optional(record.ref, (entry) => text(entry, ID_MAX));
  const status = optional(record.status, (entry) => (typeof entry === "string" && DETAIL_STATUSES.includes(entry) ? entry as ConversationActivityDetailStatus : null));
  if (title === null || body === null || ref === null || status === null) return null;
  // Read only on an ask, and only when it is one Core names. Anything else is
  // left out rather than refusing the row: the card then stays waiting, which
  // is what it was before a reader knew the field.
  const resolution = record.kind === "ask" && typeof record.resolution === "string" && RESOLUTIONS.includes(record.resolution)
    ? record.resolution as ConversationActivityResolution
    : undefined;
  return {
    kind: record.kind as ConversationActivityDetailKind,
    title,
    ...(body === undefined ? {} : { text: body }),
    ...(status === undefined ? {} : { status }),
    ...(ref === undefined ? {} : { ref }),
    ...(resolution === undefined ? {} : { resolution })
  };
}

/** Absent stays absent; present must read, or the whole event is refused. */
function optional<T>(value: unknown, read: (value: unknown) => T | null): T | null | undefined {
  return value === undefined ? undefined : read(value);
}

function text(value: unknown, max: number, lines = false): string | null {
  if (typeof value !== "string" || !value || value.length > max) return null;
  return (lines ? CONTROL_EXCEPT_LINES : CONTROL).test(value) ? null : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
