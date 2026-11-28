import { automationStudioAnthropicMessageBody } from "../../models/providers/anthropic/index.ts";
export { AUTOMATION_STUDIO_ANTHROPIC_JSON_TEXT_INSTRUCTION, automationStudioAnthropicMessageBody } from "../../models/providers/anthropic/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL, automationStudioAnthropicCacheContent, automationStudioAnthropicDecisionToolsWire, automationStudioAnthropicTrailCacheContent, type AutomationStudioAnthropicDecisionTool } from "../../models/providers/anthropic/index.ts";
import { AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE } from "../verification-checked/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness/index.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../../models/limits/index.ts";
import { automationStudioLlmEvidenceEntryMoves } from "../evidence-moves/index.ts";
import { automationStudioLlmRequestDecisionTools, automationStudioLlmTaskMessages, automationStudioLlmTaskOutputSchema, type AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";
import type { AutomationStudioAnthropicModel } from "../models/index.ts";
import { automationStudioAnthropicOutputFormat, type AutomationStudioAnthropicOutputFormat } from "../../models/providers/anthropic/index.ts";

// Adapter framing only. The product's instructions and original outputSchema
// are unchanged; this names a reversible transport encoding, no task content.

/**
 * A task's request as it is sent. `decisionTools` is set where an evidence decision goes as one native tool call
 * (D12, t1038: `../provider-task/decision-tools/`, `../../models/providers/anthropic/decision-tools-wire.ts`); its
 * `format` is then not sent, and every other task, or a decision whose schema the tools cannot express, keeps the
 * output format it had.
 */
export type AutomationStudioAnthropicPreparedRequest = {
  body: string;
  format: AutomationStudioAnthropicOutputFormat;
  decisionTools?: AutomationStudioLlmDecisionTools;
  /**
   * The tools a decision sent as tools offered, before the wire chose which go strict: where the platform refuses the
   * request for its compiled grammar, one of them is demoted for this exact offer and the request built again
   * (`../../models/providers/anthropic/strict-fit/`, t1093).
   */
  strictOffer?: readonly AutomationStudioAnthropicDecisionTool[];
  estimatedInputBytes: number;
  estimatedInputTokens: number;
};

/** The request as sent (header). `options.decisionTools: false` sends an evidence decision in the JSON-text transport instead of as tools. */
export function automationStudioAnthropicRequest(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel, options: { decisionTools?: boolean } = {}): AutomationStudioAnthropicPreparedRequest {
  const decisionTools = options.decisionTools === false ? undefined : automationStudioLlmRequestDecisionTools(request);
  const [system, user] = automationStudioLlmTaskMessages(request, decisionTools ? "decision_tools" : "json_object");
  const format = automationStudioAnthropicOutputFormat(automationStudioLlmTaskOutputSchema(request));
  // A decision's evidence, or a judge's trail (t965), is split so the next call reads what it sends again from cache.
  const content = request.context.evidenceLoop ? automationStudioAnthropicCacheContent(user!.content, automationStudioLlmEvidenceEntryMoves) : automationStudioAnthropicTrailCacheContent(user!.content) ?? user!.content;
  const messages = [{ role: "user" as const, content }];
  // The check's answer tool goes last, after the decision tools, in every decision sent as tools (t1065): a judge that
  // continues this conversation answers by calling it, and the tool list it sends is then this one, byte for byte.
  const strictOffer = decisionTools ? [...decisionTools.tools, { ...AUTOMATION_STUDIO_ANTHROPIC_JUDGE_ANSWER_TOOL, inputSchema: automationStudioAnthropicJudgeAnswerSchema(request) }] : undefined;
  const wire = strictOffer
    ? automationStudioAnthropicMessageBody({ model, system: system!.content, messages, tools: automationStudioAnthropicDecisionToolsWire(strictOffer) })
    : automationStudioAnthropicMessageBody({ model, system: system!.content, messages, format });
  // Includes the tools or the schema and adapter framing actually sent. Keys and framing
  // count too: this is conservative and agrees with the harness's preflight.
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ tools: wire.tools, tool_choice: wire.tool_choice, system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  return { body: JSON.stringify(wire), format, ...(decisionTools ? { decisionTools } : {}), ...(strictOffer ? { strictOffer } : {}), estimatedInputBytes, estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16 };
}

/**
 * The input of the check's answer tool (`../../models/providers/anthropic/judge-answer-tool.ts`): the outputSchema of the
 * judge that continues a decider, the Flow-less judge's (`../provider-task/output-schema.ts`). It depends on nothing in
 * `request` but its kind, so it is the same in every decision and the tool is the same bytes.
 */
export function automationStudioAnthropicJudgeAnswerSchema(request: AutomationStudioLlmTaskRequest): Record<string, unknown> {
  return automationStudioLlmTaskOutputSchema({ ...request, taskKind: "loop_verification", metadata: { source: AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE } })!;
}
