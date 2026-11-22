import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import { automationStudioFlowDraftReplayPassCall } from "../span.ts";
import { automationStudioFlowDraftReplaySteps } from "../draft.ts";

const parameters: JsonObject = { recordOutput: { schema: { schemaVersion: "0.1", fields: [{ id: "date", label: "Date", valueType: "string" }] }, process: { where: [{ field: "date", atMost: { $state: { path: "latest", fallback: "2030-01-02" } }, as: "date" }], declaration: { version: 1, source: "a".repeat(64), revision: 1, bindings: { date: "date" } } } } };
const step: AutomationStudioFlowDraftStep = { id: "read", position: 1, disposition: "kept", proposes: true, effect: "observe", toolId: "core.run_node", actionId: "fixture.read", input: { node: "fixture.read", parameters }, ranWith: { node: "fixture.read", parameters }, replay: { from: { location: "fixture://records" } } };

describe("forward processing template dispatch", () => {
  it("does not use fallback or coincident prior-node state when caller input is missing", () => {
    expect(automationStudioFlowDraftReplayPassCall(step, "replay", undefined, undefined, { latest: "2030-01-03" })).toEqual({ unresolved: ["latest"] });
    const current = automationStudioFlowDraftReplayPassCall(step, "replay", undefined, undefined, { latest: "2030-01-09" }, undefined, undefined, undefined, undefined, { latest: "2030-01-03" });
    expect(current).toMatchObject({ value: { parameters: { recordOutput: { process: { where: [{ atMost: "2030-01-03" }] } } } } });
  });
  it("forwards actual caller inputs through core.run_flow's existing draft walker", async () => {
    const sent: JsonObject[] = [];
    const run = async (callerInputs?: Record<string, string>) => automationStudioFlowDraftReplaySteps({ steps: [step], run: [step], callIdOf: () => "call", reanchor: false, executeTool: async ({ value }) => { sent.push(value); return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: {}, resultCode: "core.replay.replayed" }; }, forward: { rowDone: () => false, stepDone: () => false, callerInputs } });
    await run();
    expect(sent).toEqual([]);
    await run({ latest: "2030-01-03" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ parameters: { recordOutput: { process: { where: [{ atMost: "2030-01-03" }] } } } });
  });
});
