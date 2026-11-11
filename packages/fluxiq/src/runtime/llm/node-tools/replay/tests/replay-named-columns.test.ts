import { describe, expect, it, vi } from "vitest";
// The llm barrel first, as `../../../decision-context/tests/recorded-runs.ts` says why.
import { runAutomationStudioLlmEvidenceLoop } from "../../../index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan, automationStudioFlowBootstrapInstructionColumns } from "../../../../flow-authoring/bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../../flow-authoring/bootstrap/plan/tests/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep } from "../../draft-step.ts";
import { automationStudioFlowDraftReplayPassCall, automationStudioNodeReplayStepCall, automationStudioNodeReplayVerifyCall } from "../index.ts";

// A replayed read declares the columns the person named, as the saved Flow's assembly does (run-mwb2kkv5-1baeee11).
const definitions = webDomainNodeDefinitionsFixture();
const list = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
const ran = { node: list.id, parameters: { extractList: { item: ".entry", fields: { name: ".n", price: ".p", rating: ".r", link: "a@href" } } }, consequences: [] };
const step: AutomationStudioFlowDraftStep = {
  position: 2, id: "d2", iteration: 2, actionId: list.id, toolId: "core.run_node",
  input: structuredClone(ran), ranWith: structuredClone(ran), effect: "observe", effectApplied: true, disposition: "kept",
  replay: { from: { location: "https://a.example/" }, produced: { at: 2 } }
};
const request = "Find the towels under $12.97. Give me a table with columns name, price and rating.";
const named = automationStudioFlowBootstrapInstructionColumns(request);

function declared(recordOutput: unknown): string[] {
  return ((recordOutput as { schema: { fields: { id: string }[] } }).schema.fields).map((field) => field.id);
}

function recordOutputOf(value: JsonObject | undefined): unknown {
  return (value!.parameters as JsonObject).recordOutput;
}

function savedFlow(instructionText: string | undefined): unknown {
  return assembleAutomationStudioFlowDraftPlan({
    steps: [step], write: automationStudioFlowBootstrapDraftNodeStep, registry: new AutomationStudioNodeRegistry(definitions),
    resolution: { scope: { kind: "domain", domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] },
    summary: "Read the towels", ...(instructionText === undefined ? {} : { instructionText })
  }).plan!.subflows[0]!.nodes[0]!.parameters!.recordOutput;
}

describe("a replayed read's named columns", () => {
  it("reads the request's columns as name, price, rating", () => {
    expect([...named]).toEqual(["name", "price", "rating"]);
  });

  it("declares exactly the person's columns, never link, and the saved Flow's output", () => {
    const saved = savedFlow(request);
    for (const value of [
      automationStudioNodeReplayStepCall(step, {}, list, undefined, named),
      automationStudioNodeReplayVerifyCall(step, {}, list, undefined, named),
      (automationStudioFlowDraftReplayPassCall(step, "replay", undefined, undefined, undefined, list, undefined, named) as { value: JsonObject }).value,
      (automationStudioFlowDraftReplayPassCall(step, "verify", undefined, undefined, undefined, list, undefined, named) as { value: JsonObject }).value
    ]) {
      const output = recordOutputOf(value);
      expect(JSON.stringify(output)).not.toContain("link");
      expect(output).toEqual(saved);
      expect(declared(output)).toEqual(["name", "price", "rating"]);
    }
  });

  it("with nothing named declares what it declared before", () => {
    const before = recordOutputOf(automationStudioNodeReplayStepCall(step, {}, list));
    expect(recordOutputOf(automationStudioNodeReplayStepCall(step, {}, list, undefined, undefined))).toEqual(before);
    expect(recordOutputOf(automationStudioNodeReplayStepCall(step, {}, list, undefined, []))).toEqual(before);
    expect(before).toEqual(savedFlow(undefined));
    expect(JSON.stringify(before)).toContain("link");
  });
});

describe("a loop given the named columns", () => {
  /** A seeded draft holding the read, run again by `core.run_flow` and by the dry run its completion asks for. */
  async function looped(namedColumns: readonly string[] | undefined) {
    const tools = [
      { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }
    ];
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "part.1", toolId: "core.run_flow", input: { from: 1 } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async ({ value }: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => ({
      kind: "llm_evidence_tool_execution", evidence: { replay: value.replay ?? null }, effectApplied: value.replay === "reset", resultCode: "core.replay.replayed"
    }));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, executeTool, draft: { seed: [{ ...structuredClone(step), proposes: true }] }, maxIterations: 6, maxToolCalls: 6, propagateDecisionErrors: true,
      definitionOf: (id: string) => definitions.find((definition) => definition.id === id), ...(namedColumns ? { namedColumns } : {})
    });
    const sent = (prefix: string) => executeTool.mock.calls.map(([call]) => call)
      .filter((call) => call.callId.startsWith(prefix) && call.value.node === list.id && call.value.replay !== "reset")
      .map((call) => recordOutputOf(call.value));
    return { result, part: sent("part.1"), dryRun: sent("dryrun.") };
  }

  it("sends the read again declaring the person's columns, in a part run and in the dry run, as the saved Flow's read", async () => {
    const { result, part, dryRun } = await looped(named);
    expect(result).toMatchObject({ ok: true });
    expect(part.length).toBeGreaterThan(0);
    expect(dryRun.length).toBeGreaterThan(0);
    for (const output of [...part, ...dryRun]) expect(output).toEqual(savedFlow(request));
  });

  it("given none, sends what it sent before: every field the read reads", async () => {
    const { part, dryRun } = await looped(undefined);
    expect(part.length).toBeGreaterThan(0);
    expect(dryRun.length).toBeGreaterThan(0);
    for (const output of [...part, ...dryRun]) expect(declared(output)).toEqual(["name", "price", "rating", "link"]);
  });
});
