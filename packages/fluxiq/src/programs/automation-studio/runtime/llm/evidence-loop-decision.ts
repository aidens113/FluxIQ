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
 * never said repeat. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_INSTRUCTION = "Evidence entries are the current authoritative results of prior tool calls. Your goal is to produce the final structured result, not to execute the workflow that result describes. When the decision schema offers a complete variant, evaluate it first. Complete immediately once current evidence is sufficient to construct that result -- except where a core.flow_draft entry is shown: then the result is a Flow you author, and it is ready only when every act on that entry's acts checklist is done by a step you added to the Flow. Do not select a tool merely because one remains available. Use a tool only to resolve information still missing from the result; prefer observation over mutation. Use a mutating tool only when its state change is necessary to reveal otherwise unavailable evidence, such as moving to where that evidence is kept or revealing what is hidden. Never mutate merely to perform an eventual workflow step that belongs in the generated result, unless the result is a Flow built from the steps you run and add to it: then run each step it needs once and add it (a look, a failed try or a detour is never added), and to do one act to every item of a list do it to one item and state repeat, rather than doing it to each; never repeat a successful mutation merely to try another eventual-workflow value. Getting back to a state you were already in is not progress: only a step added to the Flow, or a state you had not reached, is. Never repeat the same toolId with the same input. Repeating an observation with different parameters is not progress. Do not call a mutating tool merely to unlock another observation. Treat a recoverable tool result shaped like {ok:false,code:string} as feedback and choose a different evidence-gathering action or complete if enough evidence is already available. An entry whose toolId starts with core. is Core's, not a tool result. The core.evidence_history entry is the record of all your decisions so far and what Core answered each; do not make again a decision it shows was refused or answered from memory. Every other core. entry is Core's answer to a recent decision: correct what it names, and when it names an earlier callId, use that entry instead of asking again. A tool that refused you, or was never offered, bounds only what you may do while gathering evidence, never what the result may contain: write the step you were not permitted to perform here into the result instead, from what you observed.";

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

export function automationStudioLlmEvidenceParseToolExecutionResult(
  value: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult,
  effect: AutomationStudioLlmEvidenceTool["effect"]
): { evidence: JsonValue; effectApplied: boolean; targetsUnchanged?: boolean; resultCode?: string; resultReason?: string; diagnostic?: JsonObject; repeatedAnswer?: number; personNeeded?: true; nodeId?: string; stateDigests?: { before?: string; after?: string }; draft?: AutomationStudioLlmEvidenceToolExecutionResult["draft"] } | undefined {
  if (isRecord(value) && value.kind === "llm_evidence_tool_execution") {
    if (!exactKeys(value, ["kind", "evidence", "effectApplied", "targetsUnchanged", "resultCode", "resultReason", "diagnostic", "repeatedAnswer", "personNeeded", "nodeId", "stateDigests", "routeState", "clearedWait", "draft"]) || !isJsonValue(value.evidence) || typeof value.effectApplied !== "boolean"
      || (value.targetsUnchanged !== undefined && typeof value.targetsUnchanged !== "boolean")
      || (value.resultCode !== undefined && (typeof value.resultCode !== "string" || !EVIDENCE_CLOSED_CODE.test(value.resultCode)))) return undefined;
    const draft = readCallRecord(value.draft);
    const diagnostic = automationStudioLlmEvidenceDiagnostic(value.diagnostic);
    if (value.draft !== undefined && !draft) return undefined;
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
    return {
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
      ...(draft ? { draft } : {})
    };
  }
  if (!isJsonValue(value)) return undefined;
  return { evidence: value, effectApplied: effect !== "mutate" };
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
 * What one call said it did, or nothing when it is not a statement the loop can
 * read.
 *
 * Read strictly and then carried opaquely. The name is the caller's and Core
 * never interprets it; the argument is carried so the step can be written down
 * or run again; the two flags are the caller's statement about its own call.
 */
function readCallRecord(value: unknown): AutomationStudioLlmEvidenceToolExecutionResult["draft"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !exactKeys(value, ["actionId", "input", "ranWith", "effect", "proposes", "replay"])) return undefined;
  if (value.actionId !== undefined && !validId(value.actionId)) return undefined;
  if (value.input !== undefined && !isJsonObject(value.input)) return undefined;
  if (value.ranWith !== undefined && !isJsonObject(value.ranWith)) return undefined;
  if (value.effect !== undefined && value.effect !== "observe" && value.effect !== "mutate") return undefined;
  if (value.proposes !== undefined && typeof value.proposes !== "boolean") return undefined;
  const replay = readReplayRecord(value.replay);
  if (value.replay !== undefined && !replay) return undefined;
  return {
    ...(value.actionId === undefined ? {} : { actionId: value.actionId }),
    ...(value.input === undefined ? {} : { input: value.input }),
    ...(value.ranWith === undefined ? {} : { ranWith: value.ranWith }),
    ...(value.effect === undefined ? {} : { effect: value.effect }),
    ...(value.proposes === undefined ? {} : { proposes: value.proposes }),
    ...(replay ? { replay } : {})
  };
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
      ...tools.map((tool) => ({
        type: "object", additionalProperties: false, required: ["kind", "callId", "toolId", "input"],
        properties: {
          kind: { const: "tool_call" }, callId: { type: "string", pattern: "^[a-zA-Z0-9_.:-]{1,200}$" },
          toolId: { const: tool.toolId }, input: structuredClone(tool.inputSchema),
          // Offered where the model authors its draft: promoting the step it is
          // taking costs no decision of its own (`../flow-draft/step.ts`, `taken`).
          ...(authoring ? AUTHORING_CALL_PROPERTIES : {})
        }
      }))
    ]
  };
}

/** What a call may say about the draft, where the model authors it. */
const AUTHORING_CALL_PROPERTIES: JsonObject = {
  add: { type: "boolean", description: "true: if this call works, put its step into the Flow now. A step you run is not in the Flow until you add it, here or with amend_draft add. Leave it out for a look, a try or a step the Flow does not need." },
  act: { type: "string", pattern: "^a[1-9][0-9]{0,2}([.][a-z]{1,16})?$", description: "The act from the acts checklist this step does, such as a2, or the choice under it this step makes, such as a2.quantity. Implies add." }
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
  if (value.kind === "tool_call" && exactKeys(value, ["kind", "callId", "toolId", "input", "usage", "add", "act"])
    && validId(value.callId) && validId(value.toolId) && isJsonObject(value.input) && validUsage(value.usage)
    && (value.add === undefined || typeof value.add === "boolean")
    && (value.act === undefined || (typeof value.act === "string" && AUTOMATION_STUDIO_FLOW_DRAFT_ACT_ID.test(value.act)))) {
    // `act` says the step does an act, which only a step in the Flow can: it adds.
    const add = value.add === true || value.act !== undefined;
    return {
      kind: "tool_call", callId: value.callId, toolId: value.toolId, input: value.input,
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
    // therefore the caller's statement that this one call observes.
    && (tool.initialObservation === undefined || ((tool.effect === "observe" || tool.perCallEffect === true) && isJsonObject(tool.initialObservation) && exactKeys(tool.initialObservation, ["input"]) && isJsonObject(tool.initialObservation.input))));
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

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
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
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen, depth + 1));
  return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, seen, depth + 1));
}

