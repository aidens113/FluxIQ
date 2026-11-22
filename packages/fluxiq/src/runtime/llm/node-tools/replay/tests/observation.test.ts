import { describe, expect, it } from "vitest";
// The normal llm entry initializes the same composition used by the build.
import { replayAutomationStudioFlowDraft, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../../index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import { automationStudioResultRunTrail, automationStudioResultSemanticTrail, automationStudioResultTrailOfObservations } from "../../../../result-verification/index.ts";

const FAILURE = { category: "expected_state_missing", code: "example.effect_unknown", retryable: false, stage: "confirmation", effect: "ambiguous" } as const;
const ROWS = [{ name: "Original first row" }, { name: "Original second row" }];
const step = (position: number, actionId: string): AutomationStudioFlowDraftStep => ({ id: `d${position}`, position, actionId, toolId: "core.run_node", input: { node: actionId, parameters: {}, consequences: ["update"] }, ranWith: { node: actionId, parameters: {}, consequences: ["update"] }, effect: "mutate", disposition: "kept", proposes: true, replay: { from: { location: "https://example.test/settings" } } });

describe.each([false, true])("actual draft/span observation metadata (repeat=%s)", (repeat) => {
  it("forwards reported applied/uncertain/rejected-schema facts through the real walker into the projector", async () => {
    const list = step(1, "example.list");
    const act = step(repeat ? 2 : 1, "example.update");
    if (repeat) act.routing = { kind: "repeat", over: "d1", through: "d2" };
    const steps = repeat ? [list, act] : [act];
    const actual: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { notice: "Confirmation was unavailable", page: "PRIVATE_CAPTURE_SENTINEL" }, resultCode: "core.replay.failed", effectApplied: true, failure: FAILURE, recordSchema: null };
    const report = await replayAutomationStudioFlowDraft({ steps, attempt: 1, nodeOf: (id) => id === "example.list" ? { inputs: [], outputs: [{ id: "records", type: "array" }] } : { inputs: [{ id: "item" }], outputs: [] }, executeTool: async ({ value }) => {
      if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: {}, resultCode: "core.replay.replayed" };
      if (value.node === "example.list") return { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: ROWS } }, resultCode: "core.replay.replayed", outputs: { records: ROWS } };
      return actual;
    } });
    const observed = report.observations.find((item) => item.step === act.position)!;
    expect(observed).toMatchObject({ effectApplied: true, failure: FAILURE, recordSchema: null, consequences: ["update"] });
    expect(observed.evidence).toEqual(actual.evidence);
    if (repeat) expect(observed.pass).toBe(1);
    let projected = false;
    const trail = automationStudioResultTrailOfObservations([observed], () => act.actionId, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [], projectJudgeEvidence: (input) => {
      projected = true;
      expect((input.evidence as JsonObject).recordSchema).toBeNull();
      expect((input.evidence as JsonObject).evidence).toEqual(actual.evidence);
      return { role: "action", evidence: { notice: "Confirmation was unavailable" }, missing: ["example.confirmation_missing"] };
    } });
    const shown = automationStudioResultSemanticTrail(automationStudioResultRunTrail(trail, []).trail, { deniedEvidenceKeys: [] });
    expect(projected).toBe(true);
    expect(shown.trail?.entries[0]?.framework).toMatchObject({ effectApplied: true, failure: FAILURE });
    expect(shown.projection.missing[0]?.codes).toEqual(["example.confirmation_missing"]);
    expect(JSON.stringify(shown)).not.toContain("PRIVATE_CAPTURE_SENTINEL");
  });

  it("does not infer applied/failure/schema fields for an older successful result that omitted them", async () => {
    const act = step(repeat ? 2 : 1, "example.update");
    if (repeat) act.routing = { kind: "repeat", over: "d1", through: "d2" };
    const report = await replayAutomationStudioFlowDraft({ steps: repeat ? [step(1, "example.list"), act] : [act], attempt: 1, nodeOf: (id) => id === "example.list" ? { inputs: [], outputs: [{ id: "records", type: "array" }] } : { inputs: [{ id: "item" }], outputs: [] }, executeTool: async ({ value }) => ({ kind: "llm_evidence_tool_execution", evidence: { notice: "Command answered" }, resultCode: "core.replay.replayed", ...(value.node === "example.list" ? { outputs: { records: ROWS } } : {}) }) });
    const observed = report.observations.find((item) => item.step === act.position)!;
    expect(observed.resultCode).toBe("core.replay.replayed");
    expect(observed).not.toHaveProperty("effectApplied");
    expect(observed).not.toHaveProperty("failure");
    expect(observed).not.toHaveProperty("recordSchema");
  });
});
