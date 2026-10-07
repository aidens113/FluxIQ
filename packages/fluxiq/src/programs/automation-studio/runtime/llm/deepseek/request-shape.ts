import { automationStudioFlowBootstrapCatalogNames } from "../../flow-bootstrap/index.ts";
import { automationStudioLlmTaskExpectsDiagnosis, type AutomationStudioLlmTaskRequest } from "../harness.ts";
import { automationStudioDeepSeekOutputSchema } from "./output-schema.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_RESPONSE_FORMAT,
  automationStudioDeepSeekMessages,
  estimateAutomationStudioDeepSeekInputTokens,
  type AutomationStudioDeepSeekMessage
} from "./request-body.ts";
import type { AutomationStudioDeepSeekModel } from "./models.ts";

/**
 * What may be said about an outbound request without saying what is in it.
 *
 * A 4xx is the provider rejecting the *request*, so the request is the evidence
 * -- and the request holds a page's content, a person's instruction, and every
 * handle a domain issued. None of that may travel. What travels is the shape:
 * how many messages, how large each one is, what token budget was declared
 * against what was measured, which schema and which tool ids were offered, and
 * which named field arrived empty or wrong. Every field here is a count, a
 * bound, a boolean, or an id this repository minted.
 *
 * **Nothing in this record is read out of page evidence, a locator, a
 * credential, or any text a domain or a person wrote.** `messages` carries
 * sizes, never content; `toolIds` and `requestId` are Core's own identifiers;
 * `malformed` is a list of field *names*. Adding a field that carries text is
 * how this record stops being publishable, so a later edit either keeps to
 * counts and ids or says in `malformed` that something was wrong by naming it.
 */
export type AutomationStudioDeepSeekRequestShape = {
  model: string;
  taskKind: string;
  promptVersion: string;
  /** Which stage of the loop asked, when the call belongs to one. */
  stage: string | null;
  expectedOutput: string;
  /** Core's own ids for this call. A retried or duplicated call is visible here and nowhere else. */
  requestId: string;
  idempotencyKey: string;
  timeoutMs: number;
  /** The bytes actually sent, and the reply format asked for. */
  bodyBytes: number;
  responseFormat: string;
  /** One entry per chat message, in order: its role and its size, never its text. */
  messages: readonly { role: string; bytes: number; empty: boolean }[];
  /**
   * The declared budget against the measured size.
   *
   * `measuredInput` is this adapter's own estimate of what it is about to send;
   * `declaredInput` is what the harness computed and the pre-flight checked. The
   * two disagreeing means the request that was measured is not the request that
   * went out. `inputHeadroom` and `totalHeadroom` are what was left of the
   * run's own ceilings, and they are the one request property that genuinely
   * varies between two attempts on identical caps: the node catalog, the
   * instruction and the evidence window differ per run, so two runs launched
   * with the same `--llm-max-input-tokens` do not send the same number of them.
   */
  tokens: {
    measuredInput: number;
    declaredInput: number;
    maxInput: number;
    maxOutput: number;
    maxTotal: number;
    inputHeadroom: number;
    totalHeadroom: number;
  };
  /** The answer schema offered with the request, and how large it was. */
  outputSchema: { offered: boolean; bytes: number };
  /** The tool schemas offered, by id. Core's own ids for its own options. */
  toolIds: readonly string[] | null;
  /** How much the exploration had gathered when it asked. */
  evidence: { calls: number; iteration: number } | null;
  /**
   * The node catalog a build was shown, measured rather than quoted, as it was
   * sent: `whole` entries for a one-shot build, and for an evidence decision
   * the `names` list (entries are its lines) plus the nodes it had described in
   * full (`./request-body.ts`), each sent once -- on the window entry that
   * described it, or in the head when no entry names it (t289-G).
   */
  catalog: {
    form: "whole" | "names";
    entries: number;
    bytes: number;
    truncated: boolean;
    described?: { entries: number; bytes: number };
  } | null;
  /** How many explored pages a repair was shown. */
  exploredPackets: number | null;
  /** Each field of the outbound request that arrived empty or wrong, by name. */
  malformed: readonly string[];
};

/**
 * The shape of the request this adapter sent, read back off the request itself.
 *
 * It rebuilds the messages rather than being handed them, so the one caller --
 * the refusal path -- needs nothing but what it already has. That is wasted work
 * on a call that failed and no work at all on a call that did not.
 */
export function automationStudioDeepSeekRequestShape(input: {
  request: AutomationStudioLlmTaskRequest;
  model: AutomationStudioDeepSeekModel;
  body: string;
}): AutomationStudioDeepSeekRequestShape {
  const { request, model, body } = input;
  const messages = automationStudioDeepSeekMessages(request);
  const limits = request.tokenLimits;
  const measuredInput = estimateAutomationStudioDeepSeekInputTokens(request, model);
  const schema = automationStudioDeepSeekOutputSchema(request);
  const loop = request.context.evidenceLoop;
  const bootstrap = request.context.flowBootstrap;
  const catalog = bootstrap && Array.isArray(bootstrap.nodeCatalog) ? sentCatalog(request.taskKind === "evidence_tool_decision" && loop !== undefined, bootstrap) : null;
  const tokens = {
    measuredInput,
    declaredInput: request.estimatedInputTokens,
    maxInput: limits.maxInputTokens,
    maxOutput: limits.maxOutputTokens,
    maxTotal: limits.maxTotalTokens,
    inputHeadroom: limits.maxInputTokens - measuredInput,
    totalHeadroom: limits.maxTotalTokens - (measuredInput + limits.maxOutputTokens)
  };
  const outputSchema = { offered: schema !== undefined, bytes: schema === undefined ? 0 : Buffer.byteLength(JSON.stringify(schema), "utf8") };
  return {
    model,
    taskKind: request.taskKind,
    promptVersion: request.promptVersion,
    stage: request.context.stage ?? null,
    expectedOutput: request.expectedOutput,
    requestId: request.requestId,
    idempotencyKey: request.idempotencyKey,
    timeoutMs: request.timeoutMs,
    bodyBytes: Buffer.byteLength(body, "utf8"),
    responseFormat: AUTOMATION_STUDIO_DEEPSEEK_RESPONSE_FORMAT,
    messages: messages.map((message) => {
      const bytes = Buffer.byteLength(message.content, "utf8");
      return { role: message.role, bytes, empty: message.content.trim() === "" };
    }),
    tokens,
    outputSchema,
    toolIds: loop ? loop.tools.map((tool) => tool.toolId) : null,
    evidence: loop ? { calls: loop.evidence.length, iteration: loop.iteration } : null,
    catalog,
    exploredPackets: request.context.explorationEvidence ? request.context.explorationEvidence.packets.length : null,
    malformed: malformedFields({ request, messages, schemaOffered: outputSchema.offered, tokens, loop: loop ?? null, catalog })
  };
}

/**
 * The catalog as the request body sends it: the whole catalog to a one-shot
 * build, and to an evidence decision the names (derived from the catalog the
 * same way the body derives them when the packet carries none) and the
 * described entries.
 */
function sentCatalog(
  namesOnly: boolean,
  bootstrap: NonNullable<AutomationStudioLlmTaskRequest["context"]["flowBootstrap"]>
): NonNullable<AutomationStudioDeepSeekRequestShape["catalog"]> {
  if (!namesOnly) {
    return { form: "whole", entries: bootstrap.nodeCatalog.length, bytes: jsonBytes(bootstrap.nodeCatalog), truncated: bootstrap.catalogTruncated === true };
  }
  const names = bootstrap.catalogNames ?? automationStudioFlowBootstrapCatalogNames(bootstrap.nodeCatalog);
  const described = bootstrap.describedNodes ?? [];
  return {
    form: "names",
    entries: Object.values(names).reduce((total, lines) => total + lines.length, 0),
    bytes: jsonBytes(names),
    truncated: false,
    ...(described.length ? { described: { entries: described.length, bytes: jsonBytes(described) } } : {})
  };
}

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

/**
 * The named fields that arrived empty or wrong.
 *
 * Only names, and only fields whose emptiness the provider could plausibly have
 * objected to. A request that is entirely well formed produces `[]`, which is
 * itself the finding: the provider refused something this adapter can see
 * nothing wrong with, so the next place to look is what the provider said.
 */
function malformedFields(input: {
  request: AutomationStudioLlmTaskRequest;
  messages: readonly AutomationStudioDeepSeekMessage[];
  schemaOffered: boolean;
  tokens: AutomationStudioDeepSeekRequestShape["tokens"];
  loop: NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]> | null;
  catalog: AutomationStudioDeepSeekRequestShape["catalog"];
}): string[] {
  const { request, messages, schemaOffered, tokens, loop, catalog } = input;
  const found: string[] = [];
  if (messages.length !== 2) found.push("messages");
  messages.forEach((message, index) => {
    if (message.content.trim() === "") found.push(`messages[${index}].content`);
  });
  const schemaExpected = request.taskKind === "flow_bootstrap" || request.taskKind === "evidence_tool_decision"
    || request.taskKind === "runtime_patch" || automationStudioLlmTaskExpectsDiagnosis(request.taskKind);
  if (schemaExpected && !schemaOffered) found.push("outputSchema");
  const instructions = request.context.instructions as unknown;
  if (!instructions || JSON.stringify(instructions) === "{}") found.push("context.instructions");
  if (request.taskKind === "evidence_tool_decision" && (!loop || loop.tools.length === 0)) found.push("context.evidenceLoop.tools");
  if (request.taskKind === "flow_bootstrap" && (!catalog || catalog.entries === 0)) found.push("context.flowBootstrap.nodeCatalog");
  if (tokens.measuredInput !== tokens.declaredInput) found.push("estimatedInputTokens");
  if (tokens.inputHeadroom < 0) found.push("tokenLimits.maxInputTokens");
  if (tokens.totalHeadroom < 0) found.push("tokenLimits.maxTotalTokens");
  return found;
}
