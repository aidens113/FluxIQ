// t1093: a request Anthropic refuses for its strict tools' compiled grammar is sent again with one strict tool fewer,
// until the platform accepts it; the accepted strict set is what every later request of that offer sends, and a refusal
// that cannot be answered so is kept with the API's own words. No model is called: the fetch is scripted.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS } from "../../../models/providers/anthropic/index.ts";
import { automationStudioLlmProviderRefusalWords, normalizedAutomationStudioLlmProviderFailure, type AutomationStudioLlmProviderError } from "../../../models/failures/index.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { decisionCall, jsonReply, request, toolUseStreamReply } from "./fixtures.ts";

type Wire = { tools?: Array<{ name: string; strict?: boolean; input_schema: unknown }> };

const GRAMMAR = "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.";
const refusal = (message = GRAMMAR) => () => jsonReply({ type: "error", error: { type: "invalid_request_error", message } }, 400);

const closed = (properties: JsonObject): JsonObject => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

/** A decision whose every tool is closed, so the wire sends each strict: two tools and `complete`. */
function strictDecision(): AutomationStudioLlmTaskRequest {
  const tools = [
    { toolId: "core.read_shelf", description: "Read one shelf.", effect: "observe" as const, inputSchema: closed({ shelf: { type: "string" } }) },
    { toolId: "core.write_plan", description: "Write a plan of steps.", effect: "observe" as const, inputSchema: closed({ title: { type: "string" }, steps: { type: "array", items: closed({ name: { type: "string" }, why: { type: "string" }, after: { type: "string" } }) } }) }
  ];
  const completionSchema = closed({ done: { type: "boolean" } });
  const base = request({ taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1", expectedOutput: "evidence_tool_decision" });
  return { ...base, context: { ...base.context, taskKind: "evidence_tool_decision", promptVersion: base.promptVersion, evidenceLoop: { iteration: 1, tools, evidence: [], canComplete: true, completionSchema, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true) } } };
}

const READ = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.1", toolId: "core.read_shelf", input: { shelf: "north" } } };

/** The adapter over a fetch that answers each body with `answer(body)`. */
function adapter(answer: (wire: Wire) => Response) {
  const sent: Wire[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const wire = JSON.parse(String(init.body)) as Wire;
    sent.push(wire);
    return answer(wire);
  });
  const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch });
  return { provider, sent };
}

const strictNames = (wire: Wire) => (wire.tools ?? []).filter((tool) => tool.strict === true).map((tool) => tool.name);

beforeEach(() => AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS.forgetForTests());
afterEach(() => AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS.forgetForTests());

describe("a request refused for its strict tools' compiled grammar", () => {
  it("is sent again with one strict tool fewer each time, the costliest first and complete last, until it is accepted", async () => {
    // The platform here accepts at most one strict tool.
    const { provider, sent } = adapter((wire) => strictNames(wire).length > 1 ? refusal()() : toolUseStreamReply([decisionCall(READ, strictDecision())]));
    const answered = await provider.runTask(strictDecision());
    expect((answered as { response: unknown }).response).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "tool_call", toolId: "core.read_shelf" } });
    expect(sent.map(strictNames)).toEqual([
      ["complete", "core_read_shelf", "core_write_plan"],
      ["complete", "core_read_shelf"],
      ["complete"]
    ]);
    // Each pass removed exactly one strict tool, and the tool list itself never changed.
    for (const wire of sent) expect(wire.tools!.map((tool) => tool.name)).toEqual(sent[0]!.tools!.map((tool) => tool.name));
  });

  it("sends the accepted strict set, the same bytes, on every later request of the same offer, with no second refusal", async () => {
    const { provider, sent } = adapter((wire) => strictNames(wire).length > 1 ? refusal()() : toolUseStreamReply([decisionCall(READ, strictDecision())]));
    await provider.runTask(strictDecision());
    const accepted = JSON.stringify(sent.at(-1)!.tools);
    const before = sent.length;
    await provider.runTask(strictDecision());
    await provider.runTask(strictDecision());
    expect(sent.length).toBe(before + 2);
    expect(sent.slice(before).map((wire) => JSON.stringify(wire.tools))).toEqual([accepted, accepted]);
  });

  it("keeps the refusal, with the API's own words, once no strict tool is left to demote", async () => {
    const { provider, sent } = adapter(refusal());
    const failure = await provider.runTask(strictDecision()).then(() => undefined, (error: unknown) => error as AutomationStudioLlmProviderError);
    // Three strict tools: three demotions, then the request with none strict is refused too, and that refusal stands.
    expect(sent.map((wire) => strictNames(wire).length)).toEqual([3, 2, 1, 0]);
    expect(failure).toMatchObject({ code: "llm.provider_http_error", status: 400, retryable: false, refusal: { status: 400, error: { type: "invalid_request_error", message: GRAMMAR } } });
    // The sentence rides on the record only: the message can reach text a model reads.
    expect(failure!.message).toBe("Anthropic refused the request.");
    expect(normalizedAutomationStudioLlmProviderFailure(failure)).toMatchObject({ code: "llm.provider_http_error", refusal: { error: { message: GRAMMAR } } });
    expect(automationStudioLlmProviderRefusalWords(failure!.refusal)).toBe(`the model provider refused the request: ${GRAMMAR.replace(/\.$/u, "")}`);
  });

  it("sends any other refusal once, as it was", async () => {
    const { provider, sent } = adapter(refusal("messages.0.content: something else is wrong"));
    await expect(provider.runTask(strictDecision())).rejects.toMatchObject({ code: "llm.provider_http_error", refusal: { error: { message: "messages.0.content: something else is wrong" } } });
    expect(sent).toHaveLength(1);
  });

  // t1100: the panel's replay was refused "tools.8.custom: For 'object' type, 'additionalProperties' must be explicitly set to false".
  it("demotes the strict tool a refusal names by its place, and sends the request again", async () => {
    const OPEN = "For 'object' type, 'additionalProperties' must be explicitly set to false";
    const place = (wire: Wire, name: string) => wire.tools!.findIndex((tool) => tool.name === name);
    // The platform refuses while core_read_shelf, the smallest strict schema, goes strict: the grammar's order would demote another first.
    const { provider, sent } = adapter((wire) => strictNames(wire).includes("core_read_shelf") ? refusal(`tools.${place(wire, "core_read_shelf")}.custom: ${OPEN}`)() : toolUseStreamReply([decisionCall(READ, strictDecision())]));
    const answered = await provider.runTask(strictDecision());
    expect((answered as { response: unknown }).response).toMatchObject({ kind: "evidence_tool_decision", decision: { kind: "tool_call", toolId: "core.read_shelf" } });
    expect(sent.map(strictNames)).toEqual([["complete", "core_read_shelf", "core_write_plan"], ["complete", "core_write_plan"]]);
    // Remembered for the offer: the next request goes out as accepted, with no second refusal.
    await provider.runTask(strictDecision());
    expect(sent.map(strictNames).at(-1)).toEqual(["complete", "core_write_plan"]);
    expect(sent).toHaveLength(3);
  });

  it("lets a refusal that names a tool sent non-strict stand, sent once", async () => {
    const { provider, sent } = adapter((wire) => refusal(`tools.${wire.tools!.length - 1}.custom: something is wrong`)());
    await expect(provider.runTask(strictDecision())).rejects.toMatchObject({ code: "llm.provider_http_error", status: 400 });
    expect(sent[0]!.tools!.at(-1)!.strict).toBeUndefined();
    expect(sent).toHaveLength(1);
  });

  it("writes what the API said into each refused call's step, never the raw body", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t1093-step-log-"));
    const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      const { provider } = adapter((wire) => strictNames(wire).length > 2 ? refusal()() : toolUseStreamReply([decisionCall(READ, strictDecision())]));
      await provider.runTask(strictDecision());
      const steps = readdirSync(directory).filter((folder) => folder.endsWith("-decide")).sort();
      expect(steps).toHaveLength(2);
      const refused = JSON.parse(readFileSync(join(directory, steps[0]!, "response.json"), "utf8")) as { error?: { type?: string; message?: string } };
      expect(refused.error).toMatchObject({ type: "invalid_request_error", message: GRAMMAR });
      expect(JSON.parse(readFileSync(join(directory, steps[0]!, "meta.json"), "utf8"))).toMatchObject({ status: "error", httpStatus: 400 });
      expect(JSON.parse(readFileSync(join(directory, steps[1]!, "meta.json"), "utf8"))).toMatchObject({ status: "ok" });
    } finally {
      if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
      else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
