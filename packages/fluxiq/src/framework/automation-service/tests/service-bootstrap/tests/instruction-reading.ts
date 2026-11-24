// The build's one reading of its instruction, answered apart from a test's script.
//
// **Why (t976, b2ee9ed45).** A dangerous act asks one permission question when a
// Flow or chat starts, never mid-Flow (user, 2026-11-03 and 2026-11-10). A build
// that does not start from a chat -- a legacy, candidate, project or re-author
// build -- learns the classes its task needs by reading its instruction
// (`../../../service/instruction-authority.ts`), and that reading now happens when the
// build starts, before its first decision, rather than at its first lasting step
// (`../../../service/answer-first/chat-permission/start-build.ts`). It is a model call
// like any other: it is sent, paid for and counted in the build's accounting.
//
// Tests whose subject is something else -- the decisions a build makes, its
// accounting, its endings -- script the build's decisions by number. This answers
// the reading as an instruction that asks for nothing lasting, at the usage the
// test says, and hands every other request to the test's own script, so a
// script's first reply goes to the build's first decision.

import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };

/** `runTask` with the build's reading of its instruction answered as "nothing lasting is asked for", billed at `usage`. */
export function automationStudioAnsweringInstructionReading<Result>(
  runTask: (request: AutomationStudioLlmTaskRequest) => Promise<Result>,
  usage: Usage
): (request: AutomationStudioLlmTaskRequest) => Promise<Result | { response: { kind: "evidence_tool_decision"; summary: string; decision: { kind: "complete"; result: { instructed: [] } } }; usage: Usage }> {
  return async (request) => request.metadata?.source === "instructionAuthority"
    ? { response: { kind: "evidence_tool_decision", summary: "Read the instruction.", decision: { kind: "complete", result: { instructed: [] } } }, usage: { ...usage } }
    : await runTask(request);
}
