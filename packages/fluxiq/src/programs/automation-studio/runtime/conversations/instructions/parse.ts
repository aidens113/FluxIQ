// Reading what the model answered, forgivingly.
//
// The model is asked for one small JSON object in one of three shapes --
// `{"do": id, "with": {...}}`, `{"ask": question}`, `{"reply": words}` -- and
// that is the whole of what it must produce. Everything else is Core's to
// absorb: a fenced code block, prose around the object, `capability` or
// `action` instead of `do`, `arguments` instead of `with`, a discriminator
// field naming the shape, a provider that hands back an object rather than
// text. Plain words with no object at all are a reply, because that is what
// they are.
//
// Null only for an answer that looks like it meant to be an object and cannot
// be read as one. That is the one case worth asking the model again, and the
// caller does, with the reason.

import type { AutomationStudioConversationDecision } from "./decision.ts";
import { automationStudioConversationInvocationDecision, type AutomationStudioConversationDecisionContext } from "./invocation.ts";

const INVOKE_KEYS = ["do", "capability", "capabilityid", "capability_id", "invoke", "run", "tool", "command", "id"];
const ARGUMENT_KEYS = ["with", "arguments", "args", "parameters", "params", "input", "inputs"];
const ASK_KEYS = ["ask", "question", "clarify", "clarification"];
const REPLY_KEYS = ["reply", "answer", "say", "message", "text", "response", "content"];
const SHAPE_KEYS = ["type", "kind", "action", "decision"];
const INVOKE_SHAPES = new Set(["do", "invoke", "run", "call", "capability", "tool", "command", "execute"]);
const ASK_SHAPES = new Set(["ask", "clarify", "question"]);
const TEXT_MAX = 4_000;

/**
 * The decision the model's answer carries, or null when it tried to write an
 * object and did not manage to.
 */
export function parseAutomationStudioConversationDecision(
  raw: unknown,
  context: AutomationStudioConversationDecisionContext
): AutomationStudioConversationDecision | null {
  const record = answerRecord(raw);
  if (record === "unreadable") return null;
  if (record === null) {
    const words = answerText(raw);
    return words ? { kind: "reply", text: words } : null;
  }
  return decisionFrom(record, context);
}

function decisionFrom(record: Record<string, unknown>, context: AutomationStudioConversationDecisionContext): AutomationStudioConversationDecision | null {
  const shape = lower(field(record, SHAPE_KEYS));
  const say = bounded(field(record, ["say", "message", "note"]));
  const written = field(record, INVOKE_KEYS);
  const writtenId = typeof written === "string" && !INVOKE_SHAPES.has(written.trim().toLowerCase()) ? written.trim() : "";
  if (writtenId && (!shape || INVOKE_SHAPES.has(shape))) {
    return automationStudioConversationInvocationDecision(writtenId, field(record, ARGUMENT_KEYS), context, say);
  }
  const question = bounded(field(record, ASK_KEYS));
  if (question && (!shape || ASK_SHAPES.has(shape))) return { kind: "clarify", question };
  const reply = bounded(field(record, REPLY_KEYS));
  if (reply) return { kind: "reply", text: reply };
  if (question) return { kind: "clarify", question };
  if (writtenId) return automationStudioConversationInvocationDecision(writtenId, field(record, ARGUMENT_KEYS), context, say);
  return null;
}

/** The object in an answer, null when the answer holds no object at all, or `"unreadable"` when it holds a broken one. */
function answerRecord(raw: unknown): Record<string, unknown> | null | "unreadable" {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    // A provider envelope around the model's own text: read the text.
    for (const key of ["output", "content", "text", "completion"]) {
      const inner = record[key];
      if (typeof inner === "string" && Object.keys(record).length <= 3 && inner.includes("{")) return answerRecord(inner);
    }
    return record;
  }
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0) return null;
  if (end <= start) return "unreadable";
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : "unreadable";
  } catch {
    // Braces that do not hold JSON. Not a refusal and not an empty answer: the
    // caller asks the model again with the reason, then reads the words itself.
    return "unreadable";
  }
}

function answerText(raw: unknown): string {
  if (typeof raw === "string") return bounded(raw.replace(/^```[a-z]*\s*|```\s*$/giu, "")) ?? "";
  return "";
}

/** A field by any of its accepted names, ignoring case. */
function field(record: Record<string, unknown>, names: readonly string[]): unknown {
  for (const [key, value] of Object.entries(record)) {
    if (names.includes(key.toLowerCase()) && value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function lower(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function bounded(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text;
}
