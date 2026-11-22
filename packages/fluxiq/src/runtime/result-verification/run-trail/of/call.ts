// One call an attempt made, as a trail step (`../trail.ts`): from the call and the domain's own answer to it, as the
// attempt's call chain hands them on (`SVC/answer-first/attempt/call-chain.ts`), never a model's words.
//
// `did` is the node the call ran, else the tool; `asked` the rest of what the call was given; `outcome` the answer's
// own code (Core's result code, else the domain's `code`), or `refused`/`answered`; `where` the address the answer
// gives as its `location`; `found` the answer's evidence whole, but for that address. Which words name what it acted
// on (`on`) is the domain's to say, through the chain's description of the call.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioResultTrailSemanticStep, type AutomationStudioResultTrailSemanticOptions } from "../semantic/index.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";

/** The answer shape a tool call returns through the loop's executor, as far as this reads it. */
type Execution = { kind: "llm_evidence_tool_execution"; evidence?: JsonValue; resultCode?: string | undefined; resultReason?: string | undefined; effectApplied?: boolean; failure?: unknown; recordSchema?: JsonValue; outputs?: JsonObject };

export function automationStudioResultTrailStepOfCall(call: { callId?: string | undefined; toolId: string; value: JsonObject }, answer: unknown, on?: string | undefined, semantic?: AutomationStudioResultTrailSemanticOptions): AutomationStudioResultTrailStep {
  const { node, ...rest } = call.value;
  const did = typeof node === "string" && node.trim() ? node : call.toolId;
  const execution = isExecution(answer) ? answer : undefined;
  const evidence = execution ? execution.evidence : (answer as JsonValue | undefined);
  const said = isObject(evidence) ? evidence : undefined;
  const where = typeof said?.location === "string" && said.location.trim() ? said.location.trim() : undefined;
  const { location: _shownAsWhere, ...found } = said ?? {};
  const refused = execution?.failure !== undefined || said?.ok === false;
  const code = execution?.resultCode ?? (typeof said?.code === "string" ? said.code : undefined);
  const step: AutomationStudioResultTrailStep = {
    ...(call.callId?.trim() ? { callId: call.callId.trim() } : {}),
    did,
    ...(on?.trim() ? { on: on.trim() } : {}),
    ...(Object.keys(rest).length ? { asked: rest } : {}),
    outcome: code ?? (refused ? "refused" : "answered"),
    ...(where !== undefined ? { where } : {}),
    ...(said ? (Object.keys(found).length ? { found } : {}) : evidence !== undefined ? { found: evidence } : {})
  };
  if (semantic === undefined) return step;
  const envelope: JsonObject = { evidence: evidence ?? null, ...(execution?.recordSchema === undefined ? {} : { recordSchema: execution.recordSchema }), ...(execution?.outputs === undefined ? {} : { outputs: execution.outputs }), ...(call.callId === undefined ? {} : { source: { callId: call.callId } }) };
  return automationStudioResultTrailSemanticStep(step, { source: "call", definitionId: did, evidence: envelope, asked: call.value, ...(on === undefined ? {} : { on }) }, semantic, automationStudioResultFrameworkOutcome({ ...execution, consequences: call.value.consequences }));
}

function isExecution(answer: unknown): answer is Execution {
  return isObject(answer) && answer.kind === "llm_evidence_tool_execution";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
