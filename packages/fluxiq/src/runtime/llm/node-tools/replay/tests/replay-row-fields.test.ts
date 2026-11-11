// A replayed read a repeat walks keeps the row fields the repeat reads, as the saved Flow's assembly keeps them
// (`../row-fields.ts`, run-mwb9b59w-aa0784db). Narrowed to the person's named columns without them, a forward run's
// read returned no address and every pass of the repeat that opens a row by its address stopped
// `core.replay.unresolved_binding`, on a step the saved Flow runs. A kind of site no realistic scenario is: a
// lending library's catalogue, each atlas opened by its own page.
import { describe, expect, it } from "vitest";
// The llm barrel first, as `../../../decision-context/tests/recorded-runs.ts` says why.
import { automationStudioFlowDraftReplaySteps, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../../framework/automation-service/nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan, automationStudioFlowBootstrapInstructionColumns } from "../../../../flow-authoring/bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../../flow-authoring/bootstrap/plan/tests/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep } from "../../draft-step.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE, automationStudioFlowDraftReplayPassCall, automationStudioNodeReplayStepCall, type AutomationStudioFlowDraftReplayNode } from "../index.ts";

const REPLAYED = "core.replay.replayed";
const definitions = webDomainNodeDefinitionsFixture();
const list = definitions.find((definition) => definition.id === "web.output.dom-extract_list")!;
const navigate = definitions.find((definition) => definition.id === "web.output.browser-navigate")!;
const request = "Save the atlases. Give me a table with columns title and year.";
const named = automationStudioFlowBootstrapInstructionColumns(request);

const readCall = { node: list.id, parameters: { extractList: { item: ".atlas", fields: { title: ".t", year: ".y", link: "a@href" } } }, consequences: [] };
const openCall = { node: navigate.id, parameters: { url: { $state: { path: "item.link" } } }, consequences: [] };
const draftStep = (position: number, actionId: string, call: JsonObject, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position, id: `d${position}`, iteration: position, actionId, toolId: "core.run_node",
  input: structuredClone(call), ranWith: structuredClone(call), effect: actionId === list.id ? "observe" : "mutate", effectApplied: true, disposition: "kept", proposes: true,
  replay: { from: { location: "https://library.example/atlases" }, produced: { at: position } }, ...over
});
const read = draftStep(1, list.id, readCall);
const open = draftStep(2, navigate.id, openCall, { routing: { kind: "repeat", over: "d1", through: "d2" } });
const steps = [read, open];

function fields(value: JsonObject | undefined): { stored: string[]; shown: unknown } {
  const output = (value!.parameters as JsonObject).recordOutput as { schema: { fields: { id: string }[] }; process?: { columns?: unknown } };
  return { stored: output.schema.fields.map((field) => field.id), shown: output.process?.columns };
}

function savedFlowRead(): unknown {
  const assembled = assembleAutomationStudioFlowDraftPlan({
    steps, write: automationStudioFlowBootstrapDraftNodeStep, registry: definitions.reduce((registry, definition) => registry.register(definition), new AutomationStudioNodeRegistry()),
    resolution: { scope: { kind: "domain", domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] },
    summary: "Open each atlas", instructionText: request
  });
  if (!assembled.plan) throw new Error(JSON.stringify(assembled.issues));
  return assembled.plan.subflows[0]!.nodes.find((node) => node.definitionId === list.id)!.parameters!.recordOutput;
}

describe("a replayed read a repeat walks", () => {
  it("stores the row field the repeat opens each row by, shows only the named columns, and sends the saved Flow's own record output", () => {
    const saved = savedFlowRead();
    for (const value of [
      automationStudioNodeReplayStepCall(read, {}, list, undefined, named, steps),
      (automationStudioFlowDraftReplayPassCall(read, "replay", undefined, undefined, undefined, list, undefined, named, steps) as { value: JsonObject }).value
    ]) {
      expect(fields(value)).toEqual({ stored: ["title", "year", "link"], shown: ["title", "year"] });
      expect((value!.parameters as JsonObject).recordOutput).toEqual(saved);
    }
  });

  it("keeps only the named columns where no repeat walks it", () => {
    expect(fields(automationStudioNodeReplayStepCall(read, {}, list, undefined, named, [read])).stored).toEqual(["title", "year"]);
  });

  it("lets a forward walk open each row by its own address (run-mwb9b59w-aa0784db)", async () => {
    const nodes: Record<string, AutomationStudioFlowDraftReplayNode> = { [list.id]: { inputs: [], outputs: [{ id: "records", type: "array" }] }, [navigate.id]: { inputs: [], outputs: [] } };
    const atlases = [1, 2, 3].map((n) => ({ title: `Atlas ${n}`, year: `19${10 + n}`, link: `/atlas/${n}` }));
    const opened: unknown[] = [];
    // A host that stores what the record output declares, as the domain narrows a read to it.
    const executeTool = async ({ value }: { callId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
      if (value.node === navigate.id) opened.push((value.parameters as JsonObject).url);
      const declared = value.node === list.id ? fields(value).stored : [];
      const records = atlases.map((row) => Object.fromEntries(declared.map((id) => [id, row[id as keyof typeof row]])));
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED, ...(value.node === list.id ? { outputs: { records } } : {}) };
    };
    const done = await automationStudioFlowDraftReplaySteps({
      executeTool, steps, run: steps, callIdOf: (step) => `forward.${step.position}`, reanchor: false,
      nodeOf: (id) => nodes[id], definitionOf: (id) => definitions.find((definition) => definition.id === id), namedColumns: named
    });
    expect(done.outcomes.map((outcome) => outcome.resultCode)).not.toContain(AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_UNRESOLVED_BINDING_CODE);
    expect(opened).toEqual(["/atlas/1", "/atlas/2", "/atlas/3"]);
  });
});
