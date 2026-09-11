import { describe, expect, it, vi } from "vitest";
import { persistAutomationStudioCompletedLlmEvidence, type AutomationStudioCompletedLlmEvidencePersistenceInput } from "../completed-llm-evidence.ts";

const input: AutomationStudioCompletedLlmEvidencePersistenceInput = {
  projectId: "project.one", flowId: "flow.one", evidenceKind: "runtime_failure",
  outcome: "failed", reviewerState: "unreviewed", validationState: "unknown",
  sourceRunIds: ["run.one"], sourceAdaptationIds: [], completedAt: 1
};

describe("completed LLM evidence persistence boundary", () => {
  it("reports unavailable without invoking a missing domain persistence seam", async () => {
    await expect(persistAutomationStudioCompletedLlmEvidence(undefined, input)).resolves.toBe("unavailable");
  });

  it("preserves a valid categorical result and converts failures to rejected", async () => {
    const stored = vi.fn(async () => "stored" as const);
    await expect(persistAutomationStudioCompletedLlmEvidence(stored, input)).resolves.toBe("stored");
    expect(stored).toHaveBeenCalledOnce();
    await expect(persistAutomationStudioCompletedLlmEvidence(async () => { throw new Error("protected store unavailable"); }, input)).resolves.toBe("rejected");
    await expect(persistAutomationStudioCompletedLlmEvidence(async () => "unsafe" as never, input)).resolves.toBe("rejected");
  });
});
