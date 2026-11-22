import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmHarnessInput } from "../../../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../../../../result-feed/index.ts";
import { automaticFeed, REFERENCE } from "../../../../result-feed/tests/automatic-support.ts";
import { automationStudioAnswerFirstTaskProcessing } from "../../../../result-processing/index.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../../../state.ts";
import { automationStudioAnswerFirstDecide } from "../../../decide.ts";

const CAPTURED = new Error("Stopped after capturing the actual provider-free model request.");

describe("the framework's model-visible processing mode", () => {
  it.each(["legacy", "missing-first", "action-only", "ready"] as const)("emits %s from metadata, preserving the result text independently of tools or row data", async (kind) => {
    for (const offerProcessing of [false, true]) {
      const ready = automaticFeed({ columns: ["title"] });
      ready.read("one", [{ id: "a", title: "A" }]);
      const declaration = automationStudioAnswerFirstTaskProcessing({ instructionText: "Renew the card.", declared: kind === "action-only" ? null : {}, kept: undefined, legacy: false });
      const result = kind === "ready" ? ready.feed : automationStudioAnswerFirstResultFeed({ instructionText: "Renew the card.", readRowsKey: undefined, processing: kind === "legacy" ? undefined : declaration, processingReferenceTimeMs: REFERENCE });
      const slot = vi.spyOn(result, "slot");
      let request: AutomationStudioLlmHarnessInput | undefined;
      const run = { result, steps: kind === "ready" ? ready.steps : [], input: {
        projectId: "project", flowId: "flow", cancellation: { checkpoint: () => undefined }, creation: { endIfReadingRefused: () => undefined }, provider: {},
        promptInstructions: {}, nodeDescriptions: { ids: () => [] }, routing: { observing: (value: unknown) => value, shown: (evidence: unknown) => ({ evidence, context: {} }) },
        runHarness: async (value: AutomationStudioLlmHarnessInput) => {
          request = value;
          throw CAPTURED;
        }
      } } as unknown as AutomationStudioAnswerFirstAttemptRun;
      const decide = automationStudioAnswerFirstDecide(run, { ordinal: 1, note: undefined, provider: run.input.provider.provider, startLocation: undefined });
      await expect(decide({ iteration: 1, tools: offerProcessing ? [{ toolId: "core.set_result_processing", description: "Processing", inputSchema: { type: "object" } }] : [], evidence: [{ callId: "source", toolId: "fixture.read", value: { rows: [{ processingMode: kind === "legacy" ? "automatic" : "legacy" }] } }], decisionSchema: {}, canComplete: true })).rejects.toBe(CAPTURED);
      const emitted = request?.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.result");
      expect(emitted).toEqual({ callId: "core.result", toolId: "core.result", value: { result: slot.mock.results[0]!.value, processingMode: kind === "legacy" ? "legacy" : "automatic" } });
      expect(typeof (emitted?.value as { result: unknown }).result).toBe("string");
    }
  });
});
