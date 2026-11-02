import { describe, expect, it, vi } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { automationStudioFlowSettingsFingerprint } from "../../flow-settings/index.ts";
import { resolveAutomationStudioFlowExecutionBinding } from "../resolve.ts";

describe("execution binding revision authority", () => {
  const flow = createBlankAutomationStudioFlowArtifact({ projectId: "project", flowId: "flow", name: "Flow", now: 1 });
  const ports = () => ({ getFlow: vi.fn(async () => flow), getExecutionDigest: vi.fn(async () => "digest") });

  it("uses canonical persisted revision with the original project and flow", async () => {
    const canonicalSettingsRevision = vi.fn(async () => 17);
    const source = ports();
    await expect(resolveAutomationStudioFlowExecutionBinding({ ...source, canonicalSettingsRevision }, "project", "flow"))
      .resolves.toEqual({ executionDigest: "digest", settingsRevision: 17 });
    expect(canonicalSettingsRevision).toHaveBeenCalledTimes(1);
    expect(canonicalSettingsRevision).toHaveBeenCalledWith("project", "flow");
    expect(source.getFlow).toHaveBeenCalledTimes(1);
    expect(source.getFlow).toHaveBeenCalledWith("project", "flow");
    expect(source.getExecutionDigest).toHaveBeenCalledTimes(1);
    expect(source.getExecutionDigest).toHaveBeenCalledWith("project", "flow");
  });

  it("uses the existing fingerprint only when no canonical repository is configured", async () => {
    await expect(resolveAutomationStudioFlowExecutionBinding(ports(), "project", "flow"))
      .resolves.toEqual({ executionDigest: "digest", settingsRevision: automationStudioFlowSettingsFingerprint(flow) });
  });

  it("propagates repository failure instead of inventing a fallback revision", async () => {
    const failure = new Error("repository unavailable");
    await expect(resolveAutomationStudioFlowExecutionBinding({ ...ports(), canonicalSettingsRevision: async () => { throw failure; } }, "project", "flow"))
      .rejects.toBe(failure);
  });
});
