import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioLlmStructuredResponse, AutomationStudioLlmUsageSummary } from "../harness/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmOpaqueSecretResolver } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES, AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES } from "../provider-transport/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, automationStudioAnthropicModelRefusal, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { validateAutomationStudioLlmTaskRequest } from "../provider-task/index.ts";
import type { AutomationStudioLlmSecretReference } from "../deepseek/index.ts";
import { automationStudioAnthropicMessage, automationStudioAnthropicPaidFailure } from "./messages.ts";
import { automationStudioAnthropicRequest, type AutomationStudioAnthropicPreparedRequest } from "./request.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL, automationStudioAnthropicAnswerNullsAbsent, automationStudioAnthropicDemoteStrictTool, automationStudioAnthropicRefusedForGrammar, automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeCallAnswered, automationStudioAnthropicJudgeContinuation, automationStudioAnthropicReadReply, type AutomationStudioAnthropicDeciderPrefix, type AutomationStudioAnthropicJudgeOpenTurn, type AutomationStudioAnthropicToolCall } from "../../models/providers/anthropic/index.ts";
import { automationStudioLlmDecisionFromToolCall, automationStudioLlmTaskMessages, automationStudioLlmTaskOutputSchema, type AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";
import { automationStudioLlmAttemptKey } from "../role-routing/index.ts";
import { estimateAutomationStudioAnthropicCostUsd } from "./pricing.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../../models/limits/index.ts";
import { automationStudioAnthropicTaskAnswer } from "./task-answer.ts";

export type AutomationStudioAnthropicProviderOptions = {
  secretReference: AutomationStudioLlmSecretReference;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl?: typeof fetch;
  model?: string;
  maxResponseBytes?: number;
  /**
   * Whether an evidence decision goes as one native tool call (D12, t1038; the default) or in the JSON-text transport
   * it used before (`false`). Every other task is unaffected.
   */
  decisionTools?: boolean;
};

export function createAutomationStudioAnthropicProvider(options: AutomationStudioAnthropicProviderOptions): AutomationStudioLlmProvider {
  const reference = options.secretReference?.id?.trim();
  if (options.secretReference?.kind !== "secret_reference" || !/^secret:[a-z0-9_.:-]{1,180}$/i.test(reference ?? "") || /(?:sk-|bearer\s|api[_-]?key)/i.test(reference ?? "")) throw new AutomationStudioLlmProviderError("llm.provider_secret_reference_invalid", "A valid opaque Anthropic secret reference is required.");
  const model = options.model ?? AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL;
  if (!isAutomationStudioAnthropicModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", automationStudioAnthropicModelRefusal(model));
  const decisionTools = options.decisionTools !== false;
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) throw new AutomationStudioLlmProviderError("llm.provider_response_limit_invalid", "Anthropic response-byte limit is invalid.");
  // The latest decider request of each Flow this model served, for a judge that continues it (`continued`, t965).
  const deciders = new Map<string, AutomationStudioAnthropicDeciderPrefix>();
  // A continuing judge's request whose reply was not read, by its attempt, for the ask that answers it (t1065).
  const judges = new Map<string, AutomationStudioAnthropicJudgeOpenTurn>();
  return {
    metadata: { provider: "anthropic", model },
    // The request `runTask` would send, measured without changing what is held (`peek`): for a judge continuing its
    // decider, that is the decider's whole conversation and any turns answered in it, not the judge's own request. The
    // harness prices the purse's hold on this measure, so each ask, the in-conversation re-asks included, is held at the
    // size it is sent at (t1065: a continuation was held at its standalone size, a fraction of what it sends).
    measureInput: (request) => {
      const { estimatedInputTokens, estimatedInputBytes } = continued(request, automationStudioAnthropicRequest(request, model, { decisionTools }), model, deciders, judges, true);
      return { estimatedInputTokens, estimatedInputBytes };
    },
    // Cache writes can cost more than a cold input; hold the all-write case,
    // then charge the actual read/write split. Output is the harness reserve.
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioAnthropicCostUsd(inputTokens, outputTokens, 0, model, inputTokens),
    runTask: async (request, execution) => {
      for (;;) {
        // A judge marked as continuing is held to the window by what is sent (t1089): the request it was built as carries
        // page views that a continuation leaves out, so its size refuses only the judge sent on that request.
        const marked = request.taskKind === "loop_verification" && request.metadata?.continuesDecider === true;
        const { continuation, judgeTurn, ...prepared } = continued(request, prepare(request, model, decisionTools, !marked), model, deciders, judges);
        if (marked && continuation?.used !== true) withinWindow(request, prepared, model);
        const tools = prepared.decisionTools;
        // A continuing judge's reply as it arrived, held where it is then not read: the next ask answers it in this conversation (t1065).
        let arrived: ReadonlyArray<Record<string, unknown>> | undefined;
        try {
          return await automationStudioAnthropicMessage({
            body: prepared.body, model, ...(continuation ? { continuation } : {}), fetchImpl: options.fetchImpl ?? fetch, maxResponseBytes,
            timeoutMs: request.timeoutMs, ...(execution?.signal ? { signal: execution.signal } : {}),
            requestId: request.requestId, taskKind: request.taskKind,
            ...(request.context.stage ? { stage: request.context.stage } : {}),
            ...(request.context.evidenceLoop?.iteration ? { iteration: request.context.evidenceLoop.iteration } : {}),
            requestShape: { model, taskKind: request.taskKind, requestId: request.requestId, bodyBytes: Buffer.byteLength(prepared.body, "utf8"), responseFormat: tools || judgeTurn?.answerTool ? "decision_tools" : prepared.format.jsonText ? "json_text" : "json_schema", measuredInput: prepared.estimatedInputTokens, maxOutput: AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].maxOutputTokens },
            resolveKey: async (signal) => await options.resolveSecret({ provider: "anthropic", secretReference: reference, projectId: request.context.projectId, flowId: request.context.flowId, requestId: request.requestId, purpose: "llm_provider_request", outboundBody: prepared.body, signal }),
            readAnswer: (text, usage) => parseAnswer(text, usage, request, prepared.format.jsonText),
            // A judge continuing a decider sent as tools answers by calling the check's answer tool, and by nothing else.
            readToolCall: judgeTurn?.answerTool ? (call, usage) => parseJudgeAnswer(call, usage, request) : tools ? (call, usage) => parseToolCall(call, usage, request, tools) : undefined,
            replyArrived: judgeTurn ? (reply) => { arrived = reply; } : undefined
          });
        } catch (error) {
          if (judgeTurn && arrived) held(judges, judgeTurn.key, { wire: judgeTurn.wire, reply: arrived });
          // Refused for the strict tools' compiled grammar: one strict tool is demoted for this offer and the request is
          // built and sent again (`../../models/providers/anthropic/strict-fit/`, t1093). Each pass removes one strict
          // tool, so this ends by itself; with none left, the refusal stands and says why.
          if (strictToolDemoted(error, prepared)) continue;
          throw error;
        }
      }
    }
  };
}

/**
 * The request as it is sent (t965, t967): a decider's is kept as the latest of its attempt, and a judge that continues
 * the decider's conversation (`metadata.continuesDecider`) is sent as that request's cached prefix with the judging
 * appended (`../../models/providers/anthropic/continuation.ts`), in the decider's own transport: its JSON-text format,
 * or, after a decider sent as tools (D12), the same tools and tool choice with the judge answering by the check's answer
 * tool, which every decider request sent as tools offers (`./request.ts`, t1065).
 *
 * **Its own attempt's decider, by the attempt's key.** The key is the attempt's own, read from the attempt's frame as the
 * call is sent (`../role-routing/ladder/attempt-key.ts`; t971: a key stamped on the request on the way never reached a
 * harness call, which goes to this provider directly), and a decider's prefix is held under it: a judge continues only
 * the prefix held under its own key, so it never continues another attempt's conversation. Run
 * run-mwohvt8n-a57cad8a's judges all fell back under t965's rule, which asked every call of the prefix's evidence to be
 * in the judge's trail, and Core's own entries in that evidence never are.
 *
 * Every judge's call says which way it went (`continuation`, written in its step meta): `used`, or why not.
 *
 * **A reply answered in the conversation (t1065).** A continuing judge's reply that arrives and is not read -- no call
 * of the answer tool, a call of a decision tool, an answer that does not fit -- is held under its attempt's key
 * (`judges`). The check's next ask (`metadata.judgeAnswersInConversation`, `../../result-verification/unreadable-asks/`)
 * is that request again with the reply and the answer to it, then the ask for the verdict
 * (`../../models/providers/anthropic/judge-call-answered.ts`): `answers_its_reply_in_the_conversation`. Where no reply
 * was held (none arrived), it continues the decider again with the note (`continues_the_decider_again`). Only after a
 * decider in the JSON-text transport is it asked on its own request (`standalone_after_unreadable`, t979). Every other
 * judge call, and every decision, ends a held reply.
 *
 * **The pages go with the judge's own request (t1089).** Every judge's message carries the page views its result rests on
 * (`resultSummary.pageViews`), and this is the one place that decides whether it continues: every fallback to its own
 * request (`own(...)`) sends the request as built, the views included, and a continuation leaves them out of its message
 * (`../../models/providers/anthropic/continuation.ts`), save one asked again with no reply held, which keeps them (t1067).
 */
/** The attempts whose latest decider request a model's adapter holds, the oldest dropped first. */
const DECIDERS_HELD = 8;

/** A continuing judge's call as it goes out: its attempt's key and request, kept should its reply not be read, and whether it answers by the answer tool. */
type JudgeTurn = { key: string; wire: Record<string, unknown>; answerTool: boolean };
type Prepared = AutomationStudioAnthropicPreparedRequest & { continuation?: { used: boolean; reason: string }; judgeTurn?: JudgeTurn };

/** `peek`: what would be sent, for its measure, with nothing held, dropped or recorded (t1065). */
function continued(request: AutomationStudioLlmTaskRequest, prepared: AutomationStudioAnthropicPreparedRequest, model: AutomationStudioAnthropicModel, deciders: Map<string, AutomationStudioAnthropicDeciderPrefix>, judges: Map<string, AutomationStudioAnthropicJudgeOpenTurn>, peek = false): Prepared {
  const key = automationStudioLlmAttemptKey() ?? (typeof request.metadata?.attemptKey === "string" ? request.metadata.attemptKey : undefined);
  if (request.context.evidenceLoop) {
    if (peek) return prepared;
    const prefix = key !== undefined && (prepared.format.jsonText || prepared.decisionTools) ? automationStudioAnthropicDeciderPrefix(JSON.parse(prepared.body) as Record<string, unknown>) : undefined;
    if (key !== undefined) {
      judges.delete(key);
      deciders.delete(key);
      if (prefix) held(deciders, key, prefix);
    }
    return prepared;
  }
  if (request.taskKind !== "loop_verification") return prepared;
  // A held reply is for the one ask after it; any judge call ends it, and a reply that is again not read holds it again.
  const open = key === undefined ? undefined : judges.get(key);
  if (key !== undefined && !peek) judges.delete(key);
  const own = (reason: string): Prepared => ({ ...prepared, continuation: { used: false, reason } });
  if (request.metadata?.continuesDecider !== true) return own("no_decision_in_this_attempt");
  if (key === undefined) return own("no_attempt_key");
  const prefix = deciders.get(key);
  if (!prefix) return own("no_decider_request_held_for_this_attempt_on_this_model");
  const again = request.metadata?.judgeAnswersInConversation === true;
  // After a decider in the JSON-text transport, an unreadable reply is asked on the judge's own request in its native
  // format: the cure for that transport's nested JSON (t979, F25), which a decider sent as tools does not have.
  if (again && prefix.afterTools !== true) return own("standalone_after_unreadable");
  if (prefix.afterTools === true && prefix.answerTool !== true) return own("decider_offered_no_check_answer_tool");
  const [system, user] = automationStudioLlmTaskMessages(request);
  // The reply that could not be read, answered in its conversation; with none held (it never arrived), the judging again from the decider.
  const answered = again && open ? automationStudioAnthropicJudgeCallAnswered(open, user!.content) : undefined;
  // Its page views are left out where it continues: it reads the pages in the decider's conversation (t1089). Every
  // `own(...)` above and below sends the request as it was built, the views included.
  const wire = answered ?? automationStudioAnthropicJudgeContinuation(prefix, system!.content, user!.content, { pages: again });
  const body = JSON.stringify(wire);
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ tools: wire.tools, tool_choice: wire.tool_choice, system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  const estimatedInputTokens = estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16;
  // Past the model's window, or the judge's own limits the harness holds this measure to, it is the judge's own request.
  const limits = request.tokenLimits;
  if (estimatedInputTokens + limits.maxOutputTokens > AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].contextTokens || estimatedInputTokens > limits.maxInputTokens || estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens) return own("continuation_past_the_window");
  // The judge answers in the decider's transport: in `result_json` after a JSON-text decider, by the answer tool after one sent as tools.
  return {
    body, format: { schema: prepared.format.schema, jsonText: prefix.afterTools !== true }, estimatedInputBytes, estimatedInputTokens,
    continuation: { used: true, reason: answered ? "answers_its_reply_in_the_conversation" : again ? "continues_the_decider_again" : "continues_the_decider" },
    judgeTurn: { key, wire, answerTool: prefix.answerTool === true }
  };
}

/** `value` held under `key` as the newest, the oldest dropped past the latest few attempts': an attempt that ended is never judged again. */
function held<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= DECIDERS_HELD) break;
    map.delete(oldest);
  }
}

/**
 * Whether `error` is the platform refusing `prepared` for its strict tools' compiled grammar, and one strict tool was
 * then demoted for its offer, so the request is to be built and sent again (t1093). False for every other failure, for
 * a request that offered no decision tools (a judge continuing a decider sends the decider's accepted tools), and where
 * the refused request held no strict tool left to demote.
 */
function strictToolDemoted(error: unknown, prepared: AutomationStudioAnthropicPreparedRequest): boolean {
  if (!(error instanceof AutomationStudioLlmProviderError) || !prepared.strictOffer) return false;
  if (!automationStudioAnthropicRefusedForGrammar(error.status, error.refusal?.error)) return false;
  const sent = (JSON.parse(prepared.body) as { tools?: unknown }).tools;
  return Array.isArray(sent) && automationStudioAnthropicDemoteStrictTool(prepared.strictOffer, sent as Array<Record<string, unknown>>) !== undefined;
}

/** `sized`: refuse the request here if it exceeds the window; a judge marked as continuing is refused after the adapter decides (`runTask`, t1089). */
function prepare(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel, decisionTools: boolean, sized = true): AutomationStudioAnthropicPreparedRequest {
  try {
    validateAutomationStudioLlmTaskRequest(request);
    const prepared = automationStudioAnthropicRequest(request, model, { decisionTools });
    if (sized) withinWindow(request, prepared, model);
    return prepared;
  } catch (error) {
    if (error instanceof AutomationStudioLlmProviderError) throw error;
    throw new AutomationStudioLlmProviderError("llm.provider_request_construction_failed", "Anthropic request construction failed.");
  }
}

/** Refuses `prepared` where it exceeds the request's limits or the model's window: nothing is trimmed. */
function withinWindow(request: AutomationStudioLlmTaskRequest, prepared: AutomationStudioAnthropicPreparedRequest, model: AutomationStudioAnthropicModel): void {
  const limits = request.tokenLimits;
  const window = AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].contextTokens;
  if (prepared.estimatedInputTokens > limits.maxInputTokens || prepared.estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens || prepared.estimatedInputTokens + limits.maxOutputTokens > window) {
    const inputSize = { estimatedInputTokens: prepared.estimatedInputTokens, estimatedInputBytes: prepared.estimatedInputBytes, maxInputTokens: limits.maxInputTokens, maxOutputTokens: limits.maxOutputTokens, maxTotalTokens: limits.maxTotalTokens, contextWindowTokens: window };
    throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "Anthropic request exceeds the context window; nothing was trimmed.", false, undefined, undefined, undefined, undefined, undefined, inputSize);
  }
}

function parseAnswer(text: string, usage: AutomationStudioLlmUsageSummary, request: AutomationStudioLlmTaskRequest, jsonText: boolean): AutomationStudioLlmStructuredResponse {
  // A reply that cannot be read says which case it was; the loop asks again with that.
  const structured = automationStudioAnthropicReadReply(text, jsonText, "end_turn", usage);
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  return automationStudioAnthropicTaskAnswer(structured, request, usage, text.length);
}

/**
 * A decision's tool call read back into the wrapper the loop reads (`../provider-task/decision-tools/`), then held to
 * exactly the reading and checks a JSON-text decision is (`./task-answer.ts`). A name the offer did not hold, or an input
 * that is no object, is a paid failure with its account, as an unreadable reply is. A call of the check's answer tool,
 * which every decision is offered beside its own tools (`./request.ts`, t1065), is refused by name.
 */
function parseToolCall(call: AutomationStudioAnthropicToolCall, usage: AutomationStudioLlmUsageSummary, request: AutomationStudioLlmTaskRequest, tools: AutomationStudioLlmDecisionTools): AutomationStudioLlmStructuredResponse {
  const contentChars = JSON.stringify(call.input ?? null).length;
  if (call.name === AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL.name) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage, { case: "tool_call_check_only", finishReason: "tool_use", contentChars, usage });
  const read = automationStudioLlmDecisionFromToolCall(tools, call);
  if (!read.ok) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage, { case: read.reason === "unknown_tool" ? "tool_call_unknown" : "content_not_object", finishReason: "tool_use", contentChars, usage });
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  return automationStudioAnthropicTaskAnswer(read.response, request, usage, contentChars, "tool_use");
}

/**
 * A continuing judge's answer, read from its call of the check's answer tool and from nothing else (t1065): the input is
 * the judge's reply, held to the judge's own unchanged schema as every answer is (`./task-answer.ts`). A call of a
 * decision tool is a paid failure that says so (`tool_call_not_answer`), and its reply is answered in the conversation.
 */
function parseJudgeAnswer(call: AutomationStudioAnthropicToolCall, usage: AutomationStudioLlmUsageSummary, request: AutomationStudioLlmTaskRequest): AutomationStudioLlmStructuredResponse {
  const contentChars = JSON.stringify(call.input ?? null).length;
  if (call.name !== AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL.name) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage, { case: "tool_call_not_answer", finishReason: "tool_use", contentChars, usage });
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  // A `null` the strict answer lets through for an optional member is the member left out (`../../models/providers/anthropic/strict-answer-schema.ts`, t1087); nothing else is read differently.
  return automationStudioAnthropicTaskAnswer(automationStudioAnthropicAnswerNullsAbsent(call.input, automationStudioLlmTaskOutputSchema(request)), request, usage, contentChars, "tool_use");
}
