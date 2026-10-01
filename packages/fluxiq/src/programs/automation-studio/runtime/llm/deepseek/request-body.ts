import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../token-estimation.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL, type AutomationStudioDeepSeekModel } from "./models.ts";
import { automationStudioDeepSeekOutputSchema } from "./output-schema.ts";
import { automationStudioDeepSeekSystemPrompt } from "./system-prompt.ts";

const AUTOMATION_STUDIO_DEEPSEEK_CHAT_FRAMING_TOKEN_RESERVE = 16;

/** One chat message on its way out: a role and the text under it. */
export type AutomationStudioDeepSeekMessage = { role: "system" | "user"; content: string };

/** What a request will cost in input tokens, measured on the messages it will send. */
export function estimateAutomationStudioDeepSeekInputTokens(
  request: AutomationStudioLlmTaskRequest,
  _model: AutomationStudioDeepSeekModel = AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL
): number {
  return measureAutomationStudioDeepSeekInput(request).estimatedInputTokens;
}

/**
 * The messages a request will send, measured: their UTF-8 bytes and the input
 * tokens Core's one estimator puts them at. The harness reads this through the
 * provider's `measureInput` so its own size-carrying refusal and the adapter's
 * check can never disagree (`../harness/run.ts`).
 */
export function measureAutomationStudioDeepSeekInput(request: AutomationStudioLlmTaskRequest): { estimatedInputTokens: number; estimatedInputBytes: number } {
  const messages = automationStudioDeepSeekMessages(request);
  const estimatedInputBytes = messages.reduce((total, message) => total + Buffer.byteLength(message.content, "utf8"), 0);
  return {
    estimatedInputTokens: estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + AUTOMATION_STUDIO_DEEPSEEK_CHAT_FRAMING_TOKEN_RESERVE,
    estimatedInputBytes
  };
}

/** The whole outbound request, as the bytes that go on the wire. */
export function buildAutomationStudioDeepSeekRequestBody(
  request: AutomationStudioLlmTaskRequest,
  model: AutomationStudioDeepSeekModel
): string {
  return JSON.stringify({
    model,
    max_tokens: request.tokenLimits.maxOutputTokens,
    temperature: 0,
    thinking: { type: "disabled" },
    stream: false,
    response_format: { type: "json_object" },
    messages: automationStudioDeepSeekMessages(request)
  });
}

/** The reply format every request asks for, named once so the refusal record can state it. */
export const AUTOMATION_STUDIO_DEEPSEEK_RESPONSE_FORMAT = "json_object";

export function automationStudioDeepSeekMessages(request: AutomationStudioLlmTaskRequest): AutomationStudioDeepSeekMessage[] {
  return [
    { role: "system", content: automationStudioDeepSeekSystemPrompt(request) },
    { role: "user", content: JSON.stringify(providerUserPayload(request)) }
  ];
}
/**
 * The user message, with everything that does not change between one decision
 * and the next placed before everything that does.
 *
 * **The order is the point, and it is load-bearing.** Every call of an evidence
 * loop is a fresh stateless request, so a provider's context cache is the only
 * thing that stops the same bytes being read and charged again on each one --
 * and a cache matches a *prefix*, so one varying value strands everything
 * behind it however constant that material is. The key order here used to put
 * `evidenceLoop.iteration`, a counter that changes on every single call, at
 * byte 6,499 of a 50,840-byte message, which left the tool descriptions and the
 * whole node catalog -- 20,341 identical bytes -- behind it. About 17% of a
 * request could be a stable prefix; ordered this way it is about 55%
 * (`docs/working/flow-authoring-and-defensive-runtime-plan/reports/fa-build-cost.md`
 * in the web-extension repository has the measurement).
 *
 * So: the task envelope, the decision grammar, the instruction, the tool
 * descriptions, the node catalog and the policy gates first, and only then the
 * iteration counter and the evidence window. Nothing was removed and nothing
 * was moved between messages; a later edit that adds a key must put it on the
 * correct side of that line, and a key that varies per call belongs last.
 *
 * `outputSchema` sits inside the constant block although it is not perfectly
 * constant -- it is rebuilt when the draft first becomes amendable and when the
 * budget withdraws the tools -- because it is identical across the long runs of
 * calls in between, and it is 5,726 bytes that would otherwise sit outside the
 * prefix on every call rather than on the two where it changes.
 */
function providerUserPayload(request: AutomationStudioLlmTaskRequest): Record<string, unknown> {
  const context = request.taskKind === "flow_bootstrap" && request.context.flowBootstrap
    ? {
      schemaVersion: request.context.schemaVersion,
      ...(request.context.stage ? { stage: request.context.stage } : {}),
      projectId: request.context.projectId,
      flowId: request.context.flowId,
      instructions: request.context.instructions,
      flowBootstrap: providerFlowBootstrap(request.context.flowBootstrap),
      ...(request.context.reusableContext ? { reusableContext: request.context.reusableContext } : {})
    }
    : request.taskKind === "evidence_tool_decision" && request.context.evidenceLoop
      ? {
        schemaVersion: request.context.schemaVersion,
        ...(request.context.stage ? { stage: request.context.stage } : {}),
        projectId: request.context.projectId,
        flowId: request.context.flowId,
        instructions: request.context.instructions,
        // What the run may lastingly do, and what becomes of anything else: the
        // explorer decides whether to press with this, not only the diagnosis.
        ...(request.context.policyGates ? { policyGates: request.context.policyGates } : {}),
        ...(request.context.flowBootstrap ? { flowBootstrap: providerFlowBootstrap(request.context.flowBootstrap) } : {}),
        ...(request.context.reusableContext ? { reusableContext: request.context.reusableContext } : {}),
        evidenceLoop: {
          tools: request.context.evidenceLoop.tools.map((tool) => ({
            toolId: tool.toolId,
            description: tool.description,
            ...(tool.effect ? { effect: tool.effect } : {}),
            ...(tool.repeatPolicy ? { repeatPolicy: tool.repeatPolicy } : {})
          })),
          // Everything from here changes between one call and the next, and
          // nothing constant may follow it.
          //
          // The evidence comes before the counter because it is *mostly*
          // constant while the counter is never constant at all. The window is
          // built in the order things happened and usually only gains an entry
          // (`context-window.ts`), so on a call that evicted nothing every
          // earlier entry is byte-for-byte what the last call carried and
          // extends the reusable prefix with it -- which, for the first half of
          // a build, is most of the window. Put the counter first and all of
          // that is thrown away for the sake of one integer.
          evidence: request.context.evidenceLoop.evidence,
          iteration: request.context.evidenceLoop.iteration
        }
      }
      : request.context;
  return {
    taskKind: request.taskKind,
    promptVersion: request.promptVersion,
    expectedOutput: request.expectedOutput,
    ...(automationStudioDeepSeekOutputSchema(request) ? { outputSchema: automationStudioDeepSeekOutputSchema(request) } : {}),
    context
  };
}

/**
 * What a build is shown of its catalog context: where its Flow starts, the
 * catalog, and the routing context when the build has one.
 *
 * `startLocation` comes first because it is the first thing the build has to
 * act on: it is not there, and nothing else it calls will work until it is.
 * The note beside it says so in words, because a bare address in a context
 * object is a fact and this is an instruction.
 */
function providerFlowBootstrap(context: NonNullable<AutomationStudioLlmTaskRequest["context"]["flowBootstrap"]>): Record<string, unknown> {
  const { nodeCatalog, catalogTruncated, catalogSelection, routing, startLocation } = context;
  return {
    ...(startLocation ? { startLocation, startLocationNote: FLOW_START_LOCATION_NOTE } : {}),
    nodeCatalog,
    catalogTruncated,
    catalogSelection,
    ...(routing ? { routing } : {})
  };
}

/**
 * What `startLocation` means, said once.
 *
 * The build begins nowhere: the target it is to work on has not been opened for
 * it, and every call it makes is refused until it has gone there itself. That
 * is deliberate. A Flow is assembled from the steps that ran, so a build that
 * was handed its page writes a Flow with no step that reaches one -- measured
 * on 2026-09-23, and the reason this field exists.
 */
const FLOW_START_LOCATION_NOTE =
  "You are not at startLocation yet, and nothing was opened for you. Your first call must be the node that goes there, with startLocation as its destination; every other call is refused until it has run. It is also the Flow's own first step, because the Flow is built from the steps you run.";
