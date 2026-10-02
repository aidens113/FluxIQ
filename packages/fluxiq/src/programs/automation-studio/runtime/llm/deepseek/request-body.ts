import { automationStudioFlowBootstrapCatalogNames } from "../../flow-bootstrap/index.ts";
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
 * The user message. For an evidence decision, everything that does not change
 * between one decision and the next sits before the evidence window, and
 * everything that does sits after it.
 *
 * **The order is the point, and it is load-bearing.** Every call of an evidence
 * loop is a fresh stateless request, so a provider's context cache is the only
 * thing that stops the same bytes being read and charged again on each one --
 * and a cache matches a *prefix*, so one varying value strands everything
 * behind it however constant that material is. The window is built in the
 * order things happened and a tool's result never leaves it
 * (`../context-window.ts`); only Core's own notes -- the history, the draft,
 * the budget -- are replaced, and they ride at its end
 * (`../decision-context/shown.ts`). So with nothing varying in front of it,
 * call N is a byte prefix of call N+1 up to the end of the last tool result
 * the two share, which for a build is nearly all of either.
 *
 * Measured on `run-mup2i28c-6c7fc209` (2026-10-01), where this did not hold:
 * five decisions read 15,722 / 59,061 / 173,545 / 174,103 / 214,853 input
 * tokens and DeepSeek reported 0 / 1,024 / 14,976 / 15,360 / 1,792 of them
 * cached. Three values sat in front of the evidence and moved: `outputSchema`,
 * rebuilt whenever the offer changes (completion first offered, amending
 * offered, the wrap-up withdrawing the tools, the last decision withdrawing
 * amending), which cut the prefix inside the head; `flowBootstrap.routing`,
 * which gains a situation each time a call reaches a new page state and so cut
 * it straight after the node catalog; and the offered `tools`, withdrawn in the
 * wrap-up. The scripted build in `../evidence-loop/tests/request-prefix.test.ts`
 * holds the property.
 *
 * **W2, measured again (t193, `run-muqclqt5-b04525e8`, 2026-10-02).** With the
 * varying parts behind the window, every decision still read them uncached:
 * whatever follows the window follows its newest entry, so it misses on every
 * call however rarely it changes. They were two thirds of each decision's
 * misses -- the output schema (10k characters), the tools (6k) and the routing
 * context (2.8k at the first decision, 23k by the sixteenth). The routing
 * context changes only by gaining situations, which the build now places in
 * the window after the call each followed (`../../route-state/build-routing.ts`),
 * leaving a context that is constant: it goes in front. The tools change only
 * when withdrawn (once in that build): in front, a change costs one call's
 * miss of the window instead of every call paying for them. The output schema
 * stays last: it changed three times in that build, and each change in front
 * of the window would cost the whole window, more than it costs behind it.
 * Reconstructed on that run's requests, the decisions after the first send
 * 151k uncached tokens where they sent 228k.
 *
 * So, for an evidence decision: the task envelope; the instruction, the policy
 * gates, the node catalog and a routing context that lists no situations; the
 * offered tools; then the evidence window; and after it only what varies --
 * the counter, a routing context that still lists its situations (a caller
 * that does not place them), any reusable context, and last the output schema.
 * Nothing is removed or cut. A later edit that adds a key must put it on the
 * correct side of the window, and a key that varies per call belongs after it.
 * Other task kinds are one call each and keep their order.
 *
 * The catalog an evidence decision is shown is every node by name and what it
 * does (`nodeCatalog`, from the packet's `catalogNames`), the note that says
 * how to read the rest, and the full definitions of only the nodes the build
 * asked `core.describe_nodes` about (`describedNodes`) -- user, 2026-10-01. All
 * three sit in the constant head. The names and the note never change during
 * a build; `describedNodes` only ever gains an entry at its end, so it is the
 * last thing in the head before the tools: a describe keeps the prefix through
 * every node described before it, and two requests with an unchanged described
 * set are byte prefixes exactly as before.
 */
function providerUserPayload(request: AutomationStudioLlmTaskRequest): Record<string, unknown> {
  if (request.taskKind === "evidence_tool_decision" && request.context.evidenceLoop) return providerEvidenceDecisionPayload(request, request.context.evidenceLoop);
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
    : request.context;
  return {
    taskKind: request.taskKind,
    promptVersion: request.promptVersion,
    expectedOutput: request.expectedOutput,
    ...(automationStudioDeepSeekOutputSchema(request) ? { outputSchema: automationStudioDeepSeekOutputSchema(request) } : {}),
    context
  };
}

/** One evidence decision's user message: the constant head, the window, then everything that varies (see above). */
function providerEvidenceDecisionPayload(
  request: AutomationStudioLlmTaskRequest,
  loop: NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]>
): Record<string, unknown> {
  const routing = request.context.flowBootstrap?.routing;
  // Constant once its situations are in the window; a context that still lists them grows, and goes after it.
  const routingInFront = routing !== undefined && routing.situations.length === 0;
  const outputSchema = automationStudioDeepSeekOutputSchema(request);
  return {
    taskKind: request.taskKind,
    promptVersion: request.promptVersion,
    expectedOutput: request.expectedOutput,
    context: {
      schemaVersion: request.context.schemaVersion,
      ...(request.context.stage ? { stage: request.context.stage } : {}),
      projectId: request.context.projectId,
      flowId: request.context.flowId,
      instructions: request.context.instructions,
      // What the run may lastingly do, and what becomes of anything else: the
      // explorer decides whether to press with this, not only the diagnosis.
      // Fixed for the length of a loop, so it stays in the constant head.
      ...(request.context.policyGates ? { policyGates: request.context.policyGates } : {}),
      ...(request.context.flowBootstrap ? { flowBootstrap: providerEvidenceFlowBootstrap(request.context.flowBootstrap, routingInFront) } : {}),
      evidenceLoop: {
        // Withdrawn only in the wrap-up and after an ignored redirect.
        tools: loop.tools.map((tool) => ({
          toolId: tool.toolId,
          description: tool.description,
          ...(tool.effect ? { effect: tool.effect } : {}),
          ...(tool.repeatPolicy ? { repeatPolicy: tool.repeatPolicy } : {})
        })),
        // The window. Everything after it varies between one call and the
        // next, and nothing constant may follow it.
        evidence: loop.evidence,
        iteration: loop.iteration
      },
      // Gains a situation whenever a call reaches a new page state.
      ...(routing && !routingInFront ? { routing } : {}),
      // Looked up again against each decision's fresh evidence.
      ...(request.context.reusableContext ? { reusableContext: request.context.reusableContext } : {})
    },
    // Rebuilt whenever what is offered changes: completion, amending, tools.
    ...(outputSchema ? { outputSchema } : {})
  };
}

/**
 * What a one-shot build is shown of its catalog context: where its Flow
 * starts, the whole catalog, and the routing context when the build has one.
 * It is one call with no tools, so it cannot ask for a definition and is shown
 * every one.
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
 * What an evidence decision is shown of its catalog context: where its Flow
 * starts, every node by name, the note on reading them, the routing context
 * when it is constant (`withRouting`; one that still lists its situations rides
 * after the window instead), and the nodes it has had described, last because
 * they are the one part that grows (see above). The whole catalog,
 * `catalogTruncated` and `catalogSelection` are not sent: the names list every
 * node, and a definition is one `core.describe_nodes` call away. A packet built
 * without `catalogNames` -- a request assembled by hand -- has them derived from
 * its catalog by the same function, so the wire never carries the full catalog
 * to a decision.
 */
function providerEvidenceFlowBootstrap(context: NonNullable<AutomationStudioLlmTaskRequest["context"]["flowBootstrap"]>, withRouting: boolean): Record<string, unknown> {
  const { nodeCatalog, catalogNames, describedNodes, routing, startLocation } = context;
  return {
    ...(startLocation ? { startLocation, startLocationNote: FLOW_START_LOCATION_NOTE } : {}),
    nodeCatalog: catalogNames ?? automationStudioFlowBootstrapCatalogNames(nodeCatalog),
    nodeCatalogNote: AUTOMATION_STUDIO_DEEPSEEK_NODE_CATALOG_NOTE,
    ...(withRouting && routing ? { routing } : {}),
    ...(describedNodes?.length ? { describedNodes } : {})
  };
}

/**
 * How an evidence decision reads `nodeCatalog` and `describedNodes`, said once.
 * Constant, so it sits in the cached head; held under 300 characters by
 * `./tests/request-body.test.ts`.
 */
const AUTOMATION_STUDIO_DEEPSEEK_NODE_CATALOG_NOTE =
  "nodeCatalog lists every node by id and what it does, by category. Before first running a node, ask core.describe_nodes for it (several ids at once); its inputs, outputs and parameters then stay in describedNodes for the rest of this build, so never ask for one already there.";

/**
 * What `startLocation` means, said once.
 *
 * The build begins nowhere: the target it is to work on is not handed to it,
 * and every action is refused until the Flow has gone there. That is deliberate.
 * A Flow is assembled from the steps that ran, so a build that was handed its
 * page writes a Flow with no step that reaches one -- measured on 2026-09-23,
 * and the reason this field exists.
 *
 * Going there is no longer the model's first paid decision: the loop opens the
 * build by running the domain's arrival with startLocation, keeps that step as
 * the Flow's first, and shows its result as the first evidence entry
 * (`../evidence-loop.ts`, F31). The note used to say "nothing was opened for
 * you", and `run-muqc07fh-eeffbc86` spent 17k tokens on that navigation. It
 * still says what to do when the arrival failed, or a domain declared none.
 */
const FLOW_START_LOCATION_NOTE =
  "The build opened by going to startLocation: the first entry of your evidence is that step, and it is the Flow's first step, already kept. Only if that entry failed, or your evidence does not open with it, must your first call be the node that goes there, with startLocation as its destination; every action is refused until it has run.";
