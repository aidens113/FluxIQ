// A continuing judge's reply that could not be read, answered in that same conversation (t1065).
//
// **Live evidence.** `run-mwy3btww-31d32e0d` (Sonnet 5.5): all 7 continuing judges' replies were unreadable. At 0039,
// 0060 and 0069 the judge reasoned in prose to a verdict and then called the decider's `complete` with
// `{"summary":"placeholder", ...}`; at 0034, 0077, 0104 and 0130 it reasoned in prose before its object. Each check was
// then asked on the judge's own request, by a judge that saw only the trail and could not tell.
//
// **The conversation goes on instead.** The judge now answers by calling the check's answer tool
// (`./judge-answer-tool.ts`), and a reply that is not exactly that call, read -- prose with no call, a call of a
// decision tool, an answer tool input that does not fit -- is held by the adapter with the request it answered. The next
// ask is that request again, then the reply as the assistant's turn, then a user turn with one `tool_result` per call
// (a decision tool's says no tool runs for the check; the answer tool's says it was not read) and the ask for the
// answer, with the note the judge's message carries of what could not be read and any steer of a repeat. Nothing before
// the reply changes, so the cached decider prefix is read again, and the judge keeps everything it had read.
//
// **The turn goes back as it came.** Its text and its calls as sent, and any thinking block with its signature unchanged
// (`./stream.ts` keeps them): a thinking block edited or dropped from the turn a tool result answers breaks that turn.
// A thinking block that arrived without a signature cannot be sent back, and is left out.

import { AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL } from "./judge-answer-tool.ts";

/** A continuing judge's request as it was sent, and the reply to it that could not be read. */
export type AutomationStudioAnthropicJudgeOpenTurn = { wire: Record<string, unknown>; reply: ReadonlyArray<Record<string, unknown>> };

const ANSWER = AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL.name;
/** The tool result a decision tool's call gets: no decision tool runs for a check. Generic: no site or task. */
const NO_TOOL_RUNS = `No decision tool runs for the check: this call was not made, and nothing was done or read by it. The check is answered by calling ${ANSWER}, from what the conversation above already holds.`;
/** The tool result an answer tool call that could not be read gets; the ask after it says why. */
const NOT_READ = "This answer could not be read, so it was not taken: see below.";
/** The ask after them. */
const ANSWER_NOW = `Answer the check now by calling ${ANSWER} once, with the JSON object the judge's outputSchema asks for as its whole input: only that call is read as the answer.`;

/**
 * `open`'s request with its reply and the answer to that reply appended: the reply as the assistant's turn, then a user
 * turn of one `tool_result` per call and the ask for the verdict, with the note the judge's message (`judgeUser`)
 * carries of what could not be read, and any steer of a repeat, where it carries one. Nothing before the reply changes.
 * `undefined` where nothing of the reply can go back, or the request holds no messages to go on from.
 */
export function automationStudioAnthropicJudgeCallAnswered(open: AutomationStudioAnthropicJudgeOpenTurn, judgeUser: string): Record<string, unknown> | undefined {
  const messages = open.wire.messages;
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const turn = open.reply.flatMap(echoed);
  if (!turn.some((block) => block.type === "text" || block.type === "tool_use")) return undefined;
  const results = turn.filter((block): block is { type: "tool_use"; id: string; name: string } => block.type === "tool_use")
    .map((call) => ({ type: "tool_result", tool_use_id: call.id, is_error: true, content: call.name === ANSWER ? NOT_READ : NO_TOOL_RUNS }));
  const note = noteOf(judgeUser);
  const ask = note ? `${ANSWER_NOW}\n\n${note}` : ANSWER_NOW;
  return { ...open.wire, messages: [...messages, { role: "assistant", content: turn }, { role: "user", content: [...results, { type: "text", text: ask }] }] };
}

/** A reply block as it goes back: text and calls as they came, thinking with its signature unchanged; anything else left out. */
function echoed(block: Record<string, unknown>): Array<Record<string, unknown>> {
  if (block.type === "text") return typeof block.text === "string" && block.text.length > 0 ? [{ type: "text", text: block.text }] : [];
  if (block.type === "tool_use") return typeof block.id === "string" && typeof block.name === "string" ? [{ type: "tool_use", id: block.id, name: block.name, input: isObject(block.input) ? block.input : {} }] : [];
  if (block.type === "thinking") return typeof block.signature === "string" && block.signature.length > 0 ? [{ type: "thinking", thinking: typeof block.thinking === "string" ? block.thinking : "", signature: block.signature }] : [];
  if (block.type === "redacted_thinking") return typeof block.data === "string" ? [{ type: "redacted_thinking", data: block.data }] : [];
  return [];
}

/** The note on the judge's last reply its message carries (`../../../result-verification/unreadable-asks/note.ts`), if any. */
function noteOf(judgeUser: string): string | undefined {
  try {
    const payload = JSON.parse(judgeUser) as { context?: { resultSummary?: { unreadableReply?: unknown } } };
    const note = payload.context?.resultSummary?.unreadableReply;
    return typeof note === "string" && note.length > 0 ? note : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
