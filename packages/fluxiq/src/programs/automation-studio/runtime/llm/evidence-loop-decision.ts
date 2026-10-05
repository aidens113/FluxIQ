// How the loop reads what a provider said, and writes what it may say.
//
// This is the loop's grammar, kept apart from the loop that runs on it. One
// module decides what shapes a decision may take, what a tool call's result
// has to look like to count as one, and whether a completion check answered in
// the vocabulary it was asked in; `evidence-loop.ts` decides what to do about
// each answer. The split is the reason a new decision kind is a change here
// and a case there, rather than one file that both defines the language and
// acts on it.
//
// Nothing in here reaches outside its argument. Every function is total: it
// answers with the value it could read, or with nothing, and never throws at a
// provider that replied badly -- the loop is what decides whether a reply it
// could not read ends the run or is fed back.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID,
  AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES,
  AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA,
  type AutomationStudioFlowDraftAmendment,
  type AutomationStudioFlowDraftStepReplay,
  type AutomationStudioFlowDraftStepToggle,
  automationStudioFlowDraftControlWords,
  automationStudioFlowDraftHoldsBinding,
  automationStudioFlowDraftTranslateBindings,
  type AutomationStudioFlowDraftAmendmentChange
} from "../flow-draft/index.ts";
import type { AutomationStudioLlmUsageSummary } from "./harness.ts";
import { automationStudioLlmEvidenceDiagnostic } from "./evidence-diagnostic/index.ts";
import type {
  AutomationStudioLlmEvidenceRestoredStep,
  AutomationStudioLlmEvidenceCompletionCheck,
  AutomationStudioLlmEvidenceLoopAnswerability,
  AutomationStudioLlmEvidenceLoopDecision,
  AutomationStudioLlmEvidenceTool,
  AutomationStudioLlmEvidenceToolExecutionResult
} from "./evidence-loop.ts";
import type { AutomationStudioLlmEvidenceToolFailureCode, AutomationStudioLlmEvidenceToolResultCheck } from "./tool-failure.ts";

/** Provider-neutral decision policy for bounded evidence loops. Provider adapters
 * should include this policy in their structured-decision instruction.
 *
 * The last two sentences were added after a live creation campaign in which
 * every built Flow only read and none acted. The policy already said, rightly,
 * never to mutate merely to perform a step that belongs in the generated
 * result; nothing said the converse, that a refusal here is not a refusal
 * there. Offered only tools that decline to act, and refused when it asked one
 * to, the model read the whole exercise as "acting is unavailable" and wrote
 * the only shape it had seen accepted.
 *
 * The "unless the result is a Flow built from the steps you run" clause was
 * added 2026-09-30 (lane t195). A draft is the steps the build ran, so "never
 * mutate to perform a workflow step" told a drafting model not to build its
 * Flow, and "never repeat a successful mutation" read as "act on one row
 * only": live run `run-munnop9n-5475d593` pressed one Confirm of four and
 * never said repeat.
 *
 * t252 (user, 2026-10-02: "if the task is repetitive, it should be smart and
 * make a flow that loops, takes params"): "run each step it needs once and add
 * it" read as "a step must be run to be in the Flow", so repetitive work was
 * performed item by item. The clause now says to run to learn, that a step may
 * be written once what was seen is enough, that repetitive work is a loop, and
 * that a value that changes is bound. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION = "Evidence entries are the current authoritative results of prior tool calls. Only the newest view of the target is shown whole: an earlier result whose view a later result replaced carries supersededBy, the callId of that later result, in its place, and keeps the rest of what it said -- what the step did and what changed. To see again something only a replaced view showed, look at the target as it is now. Your goal is to produce the final structured result, not to execute the workflow that result describes. When the decision schema offers a complete variant, evaluate it first. Complete immediately once current evidence is sufficient to construct that result -- except where a core.flow_draft entry is shown: then the result is a Flow you author, and it is ready only when every act on that entry's acts checklist is done by a step you added to the Flow. Do not select a tool merely because one remains available. Use a tool only to resolve information still missing from the result; prefer observation over mutation. Use a mutating tool only when its state change is necessary to reveal otherwise unavailable evidence, such as moving to where that evidence is kept or revealing what is hidden. Never mutate merely to perform an eventual workflow step that belongs in the generated result, unless the result is a Flow built from the steps you run or write and add to it: then run steps to learn what works and add the ones the Flow needs (a look, a failed try or a detour is never added); you may also write a step without running it (core.run_node with write true) once what you have seen is enough to know its node and parameters. There, repetitive work is a loop, not a sequence: list the items with a where that keeps the ones to act on, do or write the act once on one item it kept, and state repeat, never doing it to every item; a value that changes between runs or rows is bound ({\"$input\": ...}, {\"$row\": ...}), never typed in; and never repeat a successful mutation merely to try another eventual-workflow value. Getting back to a state you were already in is not progress: only a step added to the Flow, or a state you had not reached, is. Never repeat the same toolId with the same input. Repeating an observation with different parameters is not progress. Do not call a mutating tool merely to unlock another observation. Treat a recoverable tool result shaped like {ok:false,code:string} as feedback and choose a different evidence-gathering action or complete if enough evidence is already available. An entry whose toolId starts with core. is Core's, not a tool result. The core.evidence_history entry is the record of all your decisions so far and what Core answered each; do not make again a decision it shows was refused or answered from memory. Every other core. entry is Core's answer to a recent decision: correct what it names, and when it names an earlier callId, use that entry instead of asking again. A tool that refused you, or was never offered, bounds only what you may do while gathering evidence, never what the result may contain: write the step you were not permitted to perform here into the result instead, from what you observed.";

/**
 * The node call's names, restated from `./node-tools/` (`run-node.ts`,
 * `replay.ts`) rather than imported: that directory reads this grammar, so an
 * import back would be a cycle. `tests/` beside the decision parse runs it on
 * the exported names, so the two cannot drift unseen.
 */
const RUN_NODE_TOOL_ID = "core.run_node";
const WRITE_KEY = "write";
const WRITTEN_CODE = "core.run_node.written";

/** How many steps one amendment decision may edit at once. */
const MAX_AMENDMENTS_PER_DECISION = 16;

export function automationStudioLlmEvidenceCanonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(automationStudioLlmEvidenceCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${automationStudioLlmEvidenceCanonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The shape a closed code or a resolved identifier must have to travel: no whitespace, so no sentence. */
const EVIDENCE_CLOSED_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/**
 * Every member a caller's execution result may carry. Exact: a member not
 * listed here refuses the whole call as
 * `llm_evidence_loop.tool_result_invalid.unknown_key`, so **a key is learned
 * here before any caller emits it**. Exported so a caller can hold its own
 * list to this one rather than restate it by hand.
 *
 * `routeState` and `clearedWait` are listed and never read by this parser:
 * the build's routing reads the first, and the activity observer the second
 * (`../activity/ask/waited-out.ts`), each off the result the caller returned.
 * `clearedWait` was missing until 2026-10-01 while the web domain's copy of
 * this list already had it: every click whose page waited out a robot check
 * that cleared by itself was recorded as a failed call although it worked
 * (live run `run-mup2u8o3-6697c4be`, call `search2`).
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS: readonly string[] = [
  "kind", "evidence", "effectApplied", "targetsUnchanged", "resultCode", "resultReason", "diagnostic", "repeatedAnswer", "personNeeded", "nodeId", "stateDigests", "routeState", "clearedWait", "outputs", "draft"
];

type ParsedToolExecution = { evidence: JsonValue; effectApplied: boolean; targetsUnchanged?: boolean; resultCode?: string; resultReason?: string; diagnostic?: JsonObject; repeatedAnswer?: number; personNeeded?: true; nodeId?: string; stateDigests?: { before?: string; after?: string }; outputs?: JsonObject; draft?: AutomationStudioLlmEvidenceToolExecutionResult["draft"] };

/** The result read from what a tool returned, or nothing when it is not one. */
export function automationStudioLlmEvidenceParseToolExecutionResult(
  value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): ParsedToolExecution | undefined {
  const read = readToolExecution(value, effect);
  return "result" in read ? read.result : undefined;
}

/**
 * Why what a tool returned is not a result, as the code the loop records and
 * the model is shown: `llm_evidence_loop.tool_result_invalid.<check>`, naming
 * the check that refused it and nothing the caller said. Nothing for a value
 * that reads. Answered by the same reader as the parse above, so the two can
 * never disagree about a value.
 */
export function automationStudioLlmEvidenceToolResultInvalidCode(
  value: unknown,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): AutomationStudioLlmEvidenceToolFailureCode | undefined {
  const read = readToolExecution(value, effect);
  return "refused" in read ? `llm_evidence_loop.tool_result_invalid.${read.refused}` : undefined;
}

/** The one reader behind both: the result, or the first check the value failed. */
function readToolExecution(
  value: unknown,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): { result: ParsedToolExecution } | { refused: AutomationStudioLlmEvidenceToolResultCheck } {
  if (isRecord(value) && value.kind === "llm_evidence_tool_execution") {
    if (!exactKeys(value, AUTOMATION_STUDIO_LLM_EVIDENCE_TOOL_EXECUTION_KEYS)) return { refused: "unknown_key" };
    if (!isJsonValue(value.evidence)) return { refused: "evidence_not_json" };
    if (typeof value.effectApplied !== "boolean") return { refused: "effect_applied_not_boolean" };
    if (value.targetsUnchanged !== undefined && typeof value.targetsUnchanged !== "boolean") return { refused: "targets_unchanged_not_boolean" };
    if (value.resultCode !== undefined && (typeof value.resultCode !== "string" || !EVIDENCE_CLOSED_CODE.test(value.resultCode))) return { refused: "result_code_not_code" };
    const draft = readCallRecord(value.draft, value.evidence, value.resultCode);
    if (draft && "refused" in draft) return draft;
    const diagnostic = automationStudioLlmEvidenceDiagnostic(value.diagnostic);
    // **The key list had to widen before the domain emitted either of these.**
    // It is exact, so a member a caller learns to report and this check has not
    // learned is not an execution result arriving with a field too many -- it
    // is the whole result refused as `llm_evidence_loop.tool_result_invalid`,
    // and the call is recorded as a failure that never happened.
    //
    // Their *values*, unlike `resultCode` above, are dropped rather than fatal.
    // A reason and a node id are what a reader is told about a call; the call
    // itself succeeded or failed on its own, and losing the whole result over a
    // diagnostic that arrived malformed would throw away the very thing the
    // reader wanted to read.
    return { result: {
      evidence: value.evidence,
      effectApplied: value.effectApplied,
      ...(value.targetsUnchanged === undefined ? {} : { targetsUnchanged: value.targetsUnchanged }),
      ...(value.resultCode ? { resultCode: value.resultCode } : {}),
      ...(closedCode(value.resultReason) ? { resultReason: value.resultReason as string } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      // A count, read as one and never as a code: the caller saying it has just
      // answered with what it already answered. Dropped rather than fatal for
      // the same reason the two beside it are, and held to two or more because
      // the first answer of a run is not a repeat of anything.
      ...(typeof value.repeatedAnswer === "number" && Number.isInteger(value.repeatedAnswer) && value.repeatedAnswer >= 2
        ? { repeatedAnswer: value.repeatedAnswer } : {}),
      // The caller saying only a person can get past what this call met. Kept
      // only as the literal `true`, like the flag it is: anything else is
      // dropped rather than fatal, and the call reads as the ordinary result it
      // then is. Reading it is not acting on it -- the build's wrapper
      // (`../flow-bootstrap/person-needed.ts`) is what puts the question to the
      // person before any of this reaches the model.
      ...(value.personNeeded === true ? { personNeeded: true as const } : {}),
      ...(closedCode(value.nodeId) ? { nodeId: value.nodeId as string } : {}),
      // The states the call saw, from its own captures. Dropped side by side
      // rather than fatal: a malformed digest leaves that side unobserved, and
      // the call it describes still happened.
      ...(stateDigestsOf(value.stateDigests) ? { stateDigests: stateDigestsOf(value.stateDigests)! } : {}),
      // A node's output values, for the build's test and never the model
      // (`./evidence-loop/tool-execution.ts`). Dropped rather than fatal:
      // without them the test runs a repeat once, as it always did.
      ...(isJsonObject(value.outputs) ? { outputs: value.outputs } : {}),
      ...(draft ? { draft: draft.draft } : {})
    } };
  }
  if (!isJsonValue(value)) return { refused: "not_json" };
  return { result: { evidence: value, effectApplied: effect !== "mutate" } };
}

/** The code-shaped digests a call reported, or nothing when it reported none that are. */
function stateDigestsOf(value: unknown): { before?: string; after?: string } | undefined {
  if (!isRecord(value)) return undefined;
  const digests = {
    ...(closedCode(value.before) ? { before: value.before as string } : {}),
    ...(closedCode(value.after) ? { after: value.after as string } : {})
  };
  return Object.keys(digests).length ? digests : undefined;
}

/** Whether a value is a code or a resolved identifier, and so may travel onto a row a reader keeps. */
function closedCode(value: unknown): value is string {
  return typeof value === "string" && EVIDENCE_CLOSED_CODE.test(value);
}

/**
 * What one call said it did, nothing when it said nothing, or the check its
 * statement failed when it is not one the loop can read.
 *
 * Read strictly and then carried opaquely. The name is the caller's and Core
 * never interprets it; the argument is carried so the step can be written down
 * or run again; the two flags are the caller's statement about its own call.
 */
function readCallRecord(value: unknown, evidence: JsonValue, resultCode: unknown): { draft: NonNullable<AutomationStudioLlmEvidenceToolExecutionResult["draft"]> } | { refused: AutomationStudioLlmEvidenceToolResultCheck } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return { refused: "draft.not_object" };
  if (!exactKeys(value, ["actionId", "input", "ranWith", "effect", "proposes", "replay", "control", "interruption", "written", "toggle"])) return { refused: "draft.unknown_key" };
  if (value.actionId !== undefined && !validId(value.actionId)) return { refused: "draft.action_id" };
  if (value.input !== undefined && !isJsonObject(value.input)) return { refused: "draft.input" };
  if (value.ranWith !== undefined && !isJsonObject(value.ranWith)) return { refused: "draft.ran_with" };
  if (value.effect !== undefined && value.effect !== "observe" && value.effect !== "mutate") return { refused: "draft.effect" };
  if (value.proposes !== undefined && typeof value.proposes !== "boolean") return { refused: "draft.proposes" };
  const replay = readReplayRecord(value.replay);
  if (value.replay !== undefined && !replay) return { refused: "draft.replay" };
  // Page words, so withheld rather than refused when they may not travel:
  // never shown in this call's own evidence, not plain, or not words at all
  // (`../flow-draft/control-words.ts`). The call happened either way.
  const control = automationStudioFlowDraftControlWords(value.control, evidence);
  // The host's word that the call answered a layer gone after it. Only `true`
  // says it; anything else is read as saying nothing, never as a refusal --
  // the call happened either way (`../flow-draft/step.ts`, `interruption`).
  const interruption = value.interruption === true;
  // Written, not run (t252): only `true`, and only beside the code that says
  // so. A caller that ignored `write` and acted answered another code, so its
  // step is an ordinary recorded one rather than a false "written".
  const written = value.written === true && resultCode === WRITTEN_CODE;
  // The host's word that a press flipped whether its control is chosen
  // (`../flow-draft/reversal.ts`). Withheld, never refused, when it is not one:
  // the call happened either way, and only a statement that changed something can say it.
  const toggle = value.effect === "mutate" ? toggleOf(value.toggle) : undefined;
  return { draft: {
    ...(value.actionId === undefined ? {} : { actionId: value.actionId }),
    ...(value.input === undefined ? {} : { input: value.input }),
    ...(value.ranWith === undefined ? {} : { ranWith: value.ranWith }),
    ...(value.effect === undefined ? {} : { effect: value.effect }),
    ...(value.proposes === undefined ? {} : { proposes: value.proposes }),
    ...(replay ? { replay } : {}),
    ...(control === undefined ? {} : { control }),
    ...(interruption ? { interruption: true as const } : {}),
    ...(written ? { written: true as const } : {}),
    ...(toggle ? { toggle } : {})
  } };
}

/**
 * A press's flip of its control, or nothing when the value is not one: exactly
 * `key` and `to`, the key a code Core compares and never reads, `to` one of two
 * words.
 */
function toggleOf(value: unknown): AutomationStudioFlowDraftStepToggle | undefined {
  if (!isRecord(value) || !exactKeys(value, ["key", "to"]) || !closedCode(value.key)) return undefined;
  return value.to === "on" || value.to === "off" ? { key: value.key, to: value.to } : undefined;
}

/**
 * What a call said about running it again, or nothing when it is not a
 * statement the loop can read.
 *
 * Both fields are the caller's own and are carried unread: how to put the
 * target back the way this step found it, and what the step produced, so the
 * caller can say on the replay whether it produced it again
 * (`../flow-draft/dry-run.ts`). Read strictly, because a statement Core cannot
 * read must make the step unreplayable rather than half-replayable.
 */
function readReplayRecord(value: unknown): AutomationStudioFlowDraftStepReplay | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !exactKeys(value, ["from", "produced"])) return undefined;
  if (value.from !== undefined && !isJsonObject(value.from)) return undefined;
  if (value.produced !== undefined && !isJsonObject(value.produced)) return undefined;
  return {
    ...(value.from === undefined ? {} : { from: value.from }),
    ...(value.produced === undefined ? {} : { produced: value.produced })
  };
}

/**
 * What a decision may be: complete, call one of the offered tools, or -- once
 * the draft has a step to amend -- edit the draft.
 *
 * `allowAmend` is separate from the tool list because amending is not a tool:
 * it costs a call and no side effect, it is offered only when there is
 * something to amend, and the loop withdraws it once a run has spent its
 * allowance of them, which no tool does.
 */
export function buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools: AutomationStudioLlmEvidenceTool[], completionSchema: JsonObject = { type: "object" }, allowComplete = true, allowAmend = false, authoring = false): JsonObject {
  // `add` and `act` are explained once, on the first call that can act, and
  // offered bare on every other: the same two sentences on each variant were
  // 468 characters a tool on every decision (t235). Every call still takes them.
  const explainedAt = Math.max(0, tools.findIndex((tool) => tool.effect === "mutate" || tool.perCallEffect === true));
  return {
    oneOf: [
      ...(allowComplete ? [{
        type: "object", additionalProperties: false, required: ["kind", "result"],
        properties: { kind: { const: "complete" }, result: structuredClone(completionSchema) }
      }] : []),
      ...(allowAmend ? [{
        type: "object", additionalProperties: false, required: ["kind", "amendments"],
        properties: {
          kind: { const: "amend_draft" },
          amendments: { type: "array", minItems: 1, maxItems: MAX_AMENDMENTS_PER_DECISION, items: structuredClone(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_SCHEMA) }
        }
      }] : []),
      ...tools.map((tool, index) => ({
        type: "object", additionalProperties: false, required: ["kind", "callId", "toolId", "input"],
        properties: {
          kind: { const: "tool_call" }, callId: { type: "string", pattern: "^[a-zA-Z0-9_.:-]{1,200}$" },
          toolId: { const: tool.toolId }, input: structuredClone(tool.inputSchema),
          // Offered where the model authors its draft: promoting the step it is
          // taking costs no decision of its own (`../flow-draft/step.ts`, `taken`).
          ...(authoring ? (index === explainedAt ? AUTHORING_CALL_PROPERTIES : AUTHORING_CALL_PROPERTIES_BARE) : {})
        }
      }))
    ]
  };
}

/** What a call may say about the draft, where the model authors it. */
const AUTHORING_CALL_PROPERTIES: JsonObject = {
  add: { type: "boolean", description: "true: if this call works, put its step into the Flow now -- a step you run or write; write true implies add. A step you run is not in the Flow until you add it, here or with amend_draft add. Leave it out for a look, a try or a step the Flow does not need." },
  act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$", description: "The act from the acts checklist this step does, such as a2, or the choice under it this step makes, such as a2.quantity. Implies add." }
};

/** The same two properties without their explanation, which one variant carries. */
const AUTHORING_CALL_PROPERTIES_BARE: JsonObject = {
  add: { type: "boolean" },
  act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$" }
};

/** The three shapes a decision may take, which is also what a reply may arrive as instead of the wrapper. */
const DECISION_KINDS = new Set(["tool_call", "complete", "amend_draft"]);

/**
 * A reply as the evidence-decision wrapper, with everything Core can work out
 * for itself worked out rather than demanded.
 *
 * **A whole paid call is thrown away when a reply is complete but not shaped
 * exactly as asked**, and two of the sixteen calls a live build made ended that
 * way (`run-mudw1ktb-0557816b`: `llm.provider_output_invalid` and
 * `llm_output.invalid_evidence_decision`). Core records no per-call payload, so
 * which of the checks refused them is not on the record -- but every one of
 * them refuses over something Core already knows or does not need:
 *
 *   - `kind` is the wrapper's own name. Core asked for exactly one output
 *     shape and would refuse any other, so the field carries no information at
 *     all; when it is absent it is filled in.
 *   - A reply that *is* the decision, with no wrapper around it, has said
 *     everything the wrapper would have. It is lifted into one. This is the
 *     likeliest shape error in a nested grammar, and it is unambiguous: only
 *     the three decision kinds are read this way.
 *   - `summary` is a line a person reads. It was required, held to 240
 *     characters, and a reply one character over lost its decision with it.
 *     An over-long one is cut and a missing one is written from the decision.
 *
 * A wrapper is rebuilt from the three fields that mean something, so a reply
 * that also carried a field of its own -- a note, a rationale -- loses that
 * field instead of losing the call. That is deliberate and it is the safe
 * direction: the rule it replaces refused the reply because a field Core cannot
 * check must not be carried onward, and dropping the field carries it onward
 * even less than refusing did.
 *
 * Nothing here relaxes what a decision may *be*: the decision itself still goes
 * through `automationStudioLlmEvidenceParseDecision` unchanged, and a `kind`
 * that names some other task's answer is still refused rather than relabelled.
 */
export function automationStudioLlmEvidenceNormalizedDecisionResponse(value: unknown, maxSummaryLength: number): JsonObject | undefined {
  if (!isRecord(value)) return undefined;
  const bare = typeof value.kind === "string" && DECISION_KINDS.has(value.kind) && value.decision === undefined;
  if (!bare && value.kind !== undefined && value.kind !== "evidence_tool_decision") return undefined;
  const { summary, ...rest } = value;
  const decision = bare ? rest : value.decision;
  if (!isRecord(decision)) return undefined;
  return { kind: "evidence_tool_decision", summary: decisionSummary(summary, decision, maxSummaryLength), decision: decision as JsonObject };
}

/** The reply's own line where it wrote a usable one, otherwise the shortest true thing Core can say about the decision. */
function decisionSummary(summary: unknown, decision: Record<string, unknown>, maxLength: number): string {
  if (typeof summary === "string" && summary.trim()) return summary.slice(0, maxLength);
  const kind = typeof decision.kind === "string" ? decision.kind : "decision";
  const toolId = typeof decision.toolId === "string" ? ` ${decision.toolId}` : "";
  return `${kind}${toolId}`.slice(0, maxLength);
}

export function automationStudioLlmEvidenceParseDecision(value: unknown): AutomationStudioLlmEvidenceLoopDecision | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "complete" && exactKeys(value, ["kind", "result", "usage"]) && isJsonObject(value.result) && validUsage(value.usage)) {
    return { kind: "complete", result: value.result, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  if (isToolCall(value)) {
    // A node call that writes its step, or one that may not carry a binding
    // because it runs now: read here, refused by the codes below.
    const call = readNodeCall(value.toolId, value.input);
    if ("refused" in call) return undefined;
    // `act` says the step does an act, which only a step in the Flow can: it
    // adds. `write` puts the step into the Flow by writing it: it adds too.
    const add = value.add === true || value.act !== undefined || call.written;
    return {
      kind: "tool_call", callId: value.callId, toolId: value.toolId, input: call.input,
      ...(add ? { add: true as const } : {}), ...(typeof value.act === "string" ? { act: value.act } : {}),
      ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {})
    };
  }
  if (value.kind === "amend_draft" && exactKeys(value, ["kind", "amendments", "usage"]) && validUsage(value.usage)) {
    const amendments = readAmendments(value.amendments);
    if (amendments) return { kind: "amend_draft", amendments, ...(value.usage ? { usage: value.usage as AutomationStudioLlmUsageSummary } : {}) };
  }
  return undefined;
}

/** A node call whose parameters carry a binding and that runs now, which no binding can (t252, D1). */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_NEEDS_WRITE_CODE = "run_node.binding_needs_write";

/**
 * A written node call with a binding that cannot be read. Sent first, then
 * once per binding as `run_node.binding_refused.<reason>:parameters.<path>`,
 * so the model is told where and why in codes alone.
 */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE = "run_node.binding_refused";

/**
 * Why a reply that is a tool call in shape was still not read as a decision,
 * as the issue codes the model is told; nothing for any other reply, which
 * either parsed or is refused as a shape (`./evidence-loop/decision-refusal.ts`).
 * Answered by the same reader as the parse above, so the two never disagree.
 */
export function automationStudioLlmEvidenceDecisionIssueCodes(value: unknown): string[] | undefined {
  if (!isToolCall(value)) return undefined;
  const call = readNodeCall(value.toolId, value.input);
  return "refused" in call ? call.refused : undefined;
}

/** Whether a reply is a tool call of the shape the grammar reads. */
function isToolCall(value: unknown): value is { kind: "tool_call"; callId: string; toolId: string; input: JsonObject; add?: boolean; act?: string; usage?: unknown } {
  return isRecord(value) && value.kind === "tool_call" && exactKeys(value, ["kind", "callId", "toolId", "input", "usage", "add", "act"])
    && validId(value.callId) && validId(value.toolId) && isJsonObject(value.input) && validUsage(value.usage)
    && (value.add === undefined || typeof value.add === "boolean")
    && (value.act === undefined || (typeof value.act === "string" && AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(value.act)));
}

/**
 * A call's input as it is sent, and whether it writes its step; or the issue
 * codes it is refused for.
 *
 * Only a node call is read (`./node-tools/run-node.ts`); every other tool's
 * input passes as it came. **Written** (`write: true`): its parameters' binding
 * forms become the executor's state bindings here, once, before the call is
 * sent (`../flow-draft/binding-forms.ts`), so the host and every later reader
 * see one shape; a form that cannot be translated refuses the decision rather
 * than reaching a node as an object it was never meant to receive. **Run now**:
 * a binding anywhere in its parameters refuses it, because a binding resolves
 * only in the Flow and a live call carries concrete values only.
 */
function readNodeCall(toolId: string, input: JsonObject): { input: JsonObject; written: boolean } | { refused: string[] } {
  if (toolId !== RUN_NODE_TOOL_ID) return { input, written: false };
  const parameters = input.parameters;
  if (input[WRITE_KEY] !== true) {
    return automationStudioFlowDraftHoldsBinding(parameters) ? { refused: [AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_NEEDS_WRITE_CODE] } : { input, written: false };
  }
  // Parameters that are not an object are the host's to refuse, as for any call.
  if (!isJsonObject(parameters)) return { input, written: true };
  const translated = automationStudioFlowDraftTranslateBindings(parameters);
  if (translated.refused.length) {
    return { refused: [AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, ...translated.refused.map(({ path, reason }) => bindingRefusedCode(path, reason))] };
  }
  return { input: { ...input, parameters: translated.parameters }, written: true };
}

/** One refused binding as a code naming its reason and, where the path can travel as a code, where it sits. */
function bindingRefusedCode(path: string, reason: string): string {
  const named = `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.${reason}:parameters${path ? `.${path}` : ""}`;
  return EVIDENCE_CLOSED_CODE.test(named) ? named : `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.${reason}`;
}

/**
 * The amendments a reply carried, or nothing when it carried none the loop
 * could read.
 *
 * An amendment that cannot be read is left out rather than refusing the whole
 * decision, because a reply that named four steps and mistyped one has still
 * said three things worth doing, and the draft it is shown next says plainly
 * which of them landed.
 */
function readAmendments(value: unknown): AutomationStudioFlowDraftAmendment[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > MAX_AMENDMENTS_PER_DECISION) return undefined;
  const read: AutomationStudioFlowDraftAmendment[] = [];
  for (const item of value) {
    if (!isRecord(item) || !exactKeys(item, ["step", "change", "settings", "to", "input", "check", "through", "over", "act"])) continue;
    if (item.act !== undefined && (typeof item.act !== "string" || !AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(item.act))) continue;
    if (!Number.isSafeInteger(item.step) || (item.step as number) < 1) continue;
    if (typeof item.change !== "string" || !(AUTOMATION_STUDIO_FLOW_DRAFT_AMENDMENT_CHANGES as readonly string[]).includes(item.change)) continue;
    // Explicit repeat removal changes only routing, not an act/argument or
    // another route: mixed requests must be separate amendments.
    if (item.change === "unrepeat" && !exactKeys(item, ["step", "change"])) continue;
    if (item.settings !== undefined && !isJsonObject(item.settings)) continue;
    if (item.input !== undefined && !isJsonObject(item.input)) continue;
    // Every key that names another step is one position, read the same way, so
    // a mistyped one leaves the amendment out rather than becoming step zero.
    if (!["to", "check", "through", "over"].every((key) => isPosition(item[key]))) continue;
    // The three changes that need a value are dropped when it is missing,
    // rather than applied as something else: a `rerun` with no argument would
    // rerun the step with the argument that was already wrong, and an
    // `on_failed` naming no step would say a failure recovers into nowhere.
    if (item.change === "reorder" && item.to === undefined) continue;
    if (item.change === "rerun" && item.input === undefined) continue;
    if (item.change === "on_failed" && item.to === undefined) continue;
    read.push({
      step: item.step as number,
      change: item.change as AutomationStudioFlowDraftAmendmentChange,
      ...(item.settings ? { settings: item.settings } : {}),
      ...(item.to === undefined ? {} : { to: item.to as number }),
      ...(item.input ? { input: item.input } : {}),
      ...(item.check === undefined ? {} : { check: item.check as number }),
      ...(item.through === undefined ? {} : { through: item.through as number }),
      ...(item.over === undefined ? {} : { over: item.over as number }),
      ...(item.act === undefined ? {} : { act: item.act as string })
    });
  }
  return read.length ? read : undefined;
}

/**
 * A check's answer, or `undefined` when it is not one. Issue codes are kept
 * only when they are codes; feedback only when it is bounded JSON.
 */
export function automationStudioLlmEvidenceParseCompletionCheck(value: unknown): AutomationStudioLlmEvidenceCompletionCheck | undefined {
  if (!isRecord(value)) return undefined;
  const answerability = readAnswerability(value.answerability);
  if (value.answerability !== undefined && !answerability) return undefined;
  const restoredStep = automationStudioLlmEvidenceParseRestoredStep(value.restoredStep);
  if (value.restoredStep !== undefined && !restoredStep) return undefined;
  const facts = { ...(answerability ? { answerability } : {}), ...(restoredStep ? { restoredStep } : {}) };
  if (value.ok === true && exactKeys(value, ["ok", "answerability", "restoredStep"])) return { ok: true, ...facts };
  if (value.ok !== false || !exactKeys(value, ["ok", "issueCodes", "feedback", "answerability", "restoredStep"]) || !Array.isArray(value.issueCodes) || !isJsonObject(value.feedback)) return undefined;
  const issueCodes = value.issueCodes.filter((code): code is string => typeof code === "string" && /^[a-z0-9_.:-]{1,100}$/i.test(code));
  return { ok: false, issueCodes, feedback: structuredClone(value.feedback), ...facts };
}

/** A restored step as a check or a stored record wrote it, or nothing when it is not exactly one. */
export function automationStudioLlmEvidenceParseRestoredStep(value: unknown): AutomationStudioLlmEvidenceRestoredStep | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { step, withdrawnAs, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length || !Number.isSafeInteger(step) || (step as number) < 1) return undefined;
  if (withdrawnAs !== "dropped" && withdrawnAs !== "exploratory" && withdrawnAs !== "taken") return undefined;
  return { step: step as number, withdrawnAs };
}

function readAnswerability(value: unknown): AutomationStudioLlmEvidenceLoopAnswerability | undefined {
  if (!isRecord(value) || !exactKeys(value, ["recordsRequested", "recordProducerPresent", "recordStorePresent", "issueCode"])) return undefined;
  if (typeof value.recordsRequested !== "boolean" || typeof value.recordProducerPresent !== "boolean" || typeof value.recordStorePresent !== "boolean") return undefined;
  if (value.issueCode !== undefined && value.issueCode !== "bootstrap.cannot_answer_instruction") return undefined;
  return {
    recordsRequested: value.recordsRequested,
    recordProducerPresent: value.recordProducerPresent,
    recordStorePresent: value.recordStorePresent,
    ...(value.issueCode ? { issueCode: value.issueCode } : {})
  };
}

export function automationStudioLlmEvidenceValidTools(tools: AutomationStudioLlmEvidenceTool[]): boolean {
  if (!Array.isArray(tools) || !tools.length || tools.length > 32) return false;
  const ids = new Set<string>();
  const structurallyValid = tools.every((tool) => validId(tool.toolId) && !ids.has(tool.toolId) && Boolean(ids.add(tool.toolId))
    && typeof tool.description === "string" && tool.description.length > 0 && tool.description.length <= 2_000 && isJsonObject(tool.inputSchema)
    && (tool.effect === undefined || tool.effect === "observe" || tool.effect === "mutate")
    && (tool.perCallEffect === undefined || typeof tool.perCallEffect === "boolean")
    && (tool.actionInputKey === undefined || (typeof tool.actionInputKey === "string" && /^[a-z][a-z0-9_]{0,63}$/i.test(tool.actionInputKey)))
    && (tool.repeatPolicy === undefined || (tool.repeatPolicy === "after_mutation" && tool.effect === "observe"))
    // A first look is free only where it is a look. That is a tool that only
    // observes -- or one whose calls declare their own effect, whose initial
    // argument the *caller* writes rather than the model, and which is
    // therefore the caller's statement that this one call observes. Its
    // `arrival`, run instead to go to where the Flow starts, is the same tool
    // going somewhere, so only a tool whose calls declare their effect has one.
    && (tool.initialObservation === undefined || ((tool.effect === "observe" || tool.perCallEffect === true) && isJsonObject(tool.initialObservation) && exactKeys(tool.initialObservation, ["input", "arrival"]) && isJsonObject(tool.initialObservation.input)
      && (tool.initialObservation.arrival === undefined || (tool.perCallEffect === true && isJsonObject(tool.initialObservation.arrival))))));
  return structurallyValid
    && tools.filter((tool) => tool.initialObservation !== undefined).length <= 1
    && (!tools.some((tool) => tool.repeatPolicy === "after_mutation") || tools.some((tool) => tool.effect === "mutate"));
}

/**
 * A decision's usage report, checked against an exact key list.
 *
 * The list is exact, so a field the provider adapter learns to report and this
 * check does not know is not an extra field on a usable decision -- it is a
 * decision the loop throws away. The cache split was added to both at once for
 * that reason.
 */
function validUsage(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isRecord(value) || !exactKeys(value, ["inputTokens", "outputTokens", "totalTokens", "cacheHitInputTokens", "cacheMissInputTokens", "estimatedCostUsd"])) return false;
  return [value.inputTokens, value.outputTokens, value.totalTokens, value.cacheHitInputTokens, value.cacheMissInputTokens].every((item) => item === undefined || (Number.isSafeInteger(item) && (item as number) >= 0))
    && (value.estimatedCostUsd === undefined || (typeof value.estimatedCostUsd === "number" && Number.isFinite(value.estimatedCostUsd) && value.estimatedCostUsd >= 0));
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

/** Whether a key naming another step is absent or a position counting from 1. */
function isPosition(value: unknown): boolean { return value === undefined || (Number.isSafeInteger(value) && (value as number) >= 1); }
function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isJsonObject(value: unknown): value is JsonObject { return isRecord(value) && isJsonValue(value); }
/** How deep a JSON value may nest before it is refused: a recursion guard, not a size limit. */
const AUTOMATION_STUDIO_LLM_JSON_MAX_DEPTH = 64;

/**
 * Whether a value is JSON. No count or length limit: a whole page arrives as
 * one tool result with thousands of elements, and every one of them is shown
 * to the model (`./context-window.ts`). What stays is what makes it JSON at
 * all -- no cycle, finite numbers -- and a recursion guard.
 */
function isJsonValue(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || depth > AUTOMATION_STUDIO_LLM_JSON_MAX_DEPTH || seen.has(value)) return false;
  // `seen` holds this value's ancestors only: an object reached twice by two
  // paths (a read's first rows are the same objects as its records) is not a
  // cycle. Until 2026-10-02 every object stayed in `seen`, so every list read
  // that returned rows was refused as not JSON (live run `run-muqilf9s-c3211328`).
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen, depth + 1))
    : Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, seen, depth + 1));
  seen.delete(value);
  return valid;
}

