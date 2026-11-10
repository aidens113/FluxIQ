import type { JsonObject } from "../../../../core/index.ts";

/**
 * One decision the model makes: answer the person, or call one tool with an
 * input and a short reason in plain words (shown as the step's reason).
 */
export type PanelAssistantDecision =
  | { kind: "reply"; text: string }
  | { kind: "call"; tool: string; input: JsonObject; why: string };

/**
 * The model's answer read as a decision: `{"reply": "..."}`, or
 * `{"tool": "...", "input": {...}, "why": "..."}`, as a JSON string or an
 * object. Anything else is a problem the model is told about in words it can
 * act on; nothing is guessed.
 */
export function panelAssistantDecisionOf(raw: unknown): { ok: true; decision: PanelAssistantDecision } | { ok: false; problem: string } {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, problem: "The answer was not JSON." };
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, problem: "The answer was not one JSON object." };
  const answer = value as Record<string, unknown>;
  if (typeof answer.reply === "string") {
    const text = answer.reply.trim();
    if (!text) return { ok: false, problem: "The reply was empty." };
    if (answer.tool !== undefined) return { ok: false, problem: "The answer both replied and called a tool; do one." };
    return { ok: true, decision: { kind: "reply", text } };
  }
  if (typeof answer.tool !== "string" || !answer.tool.trim()) return { ok: false, problem: "The answer had neither a \"reply\" nor a \"tool\"." };
  const input = answer.input === undefined ? {} : answer.input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, problem: "A tool's \"input\" must be a JSON object." };
  const why = typeof answer.why === "string" ? answer.why.trim() : "";
  return { ok: true, decision: { kind: "call", tool: answer.tool.trim(), input: input as JsonObject, why } };
}
