import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import { applyAutomationStudioRuntimeReauthorAndContinueGrant } from "../reauthor-continuation.ts";

const previous = { executionDigest: "digest.previous", settingsRevision: 7 };
const adaptation = {
  adaptationId: "adaptation.one",
  projectId: "project.one",
  flowId: "flow.one",
  baseDependencyDigest: previous.executionDigest,
  baseSettingsRevision: previous.settingsRevision
} as AutomationStudioBootstrapAdaptation;
const grant = {
  grantId: "grant.one",
  actorUserId: "user.one",
  actorSessionId: "session.one",
  purpose: "build_and_adapt"
} as const;

describe("runtime reauthor grant continuation", () => {
  it("reports a closed post-apply outcome when the authoritative binding read fails", async () => {
    const continueGrant = vi.fn();
    const applied = { ...adaptation, application: {} } as AutomationStudioBootstrapAdaptation;
    let durablyApplied = false;
    const result = await applyAutomationStudioRuntimeReauthorAndContinueGrant({
      projectId: adaptation.projectId,
      flowId: adaptation.flowId,
      adaptationId: adaptation.adaptationId,
      actorId: "runtime.result_repair",
      expectedPreviousBinding: previous,
      executionGrant: grant,
      withLock: async (callback) => await callback(),
      loadAdaptation: async () => adaptation,
      apply: async () => { durablyApplied = true; return applied; },
      readAppliedBinding: async () => { throw new Error("binding read detail must not escape"); },
      continueGrant
    });

    expect(durablyApplied).toBe(true);
    expect(result).toEqual({ replayReady: false, code: "llm.execution_grant_no_longer_valid" });
    expect(continueGrant).not.toHaveBeenCalled();
  });

  it("reduces an arbitrary secret-bearing continuation error to fixed typed provenance", async () => {
    const applied = { ...adaptation, application: {} } as AutomationStudioBootstrapAdaptation;
    const result = await applyAutomationStudioRuntimeReauthorAndContinueGrant({
      projectId: adaptation.projectId, flowId: adaptation.flowId, adaptationId: adaptation.adaptationId,
      actorId: "runtime.result_repair", expectedPreviousBinding: previous, executionGrant: grant,
      withLock: async (callback) => await callback(), loadAdaptation: async () => adaptation,
      apply: async () => applied,
      readAppliedBinding: async () => ({ executionDigest: "digest.applied", settingsRevision: 8 }),
      continueGrant: async () => { throw new Error("secret-value-must-not-escape"); }
    });

    expect(result).toEqual({ replayReady: false, code: "llm.execution_grant_no_longer_valid" });
    expect(JSON.stringify(result)).not.toContain("secret-value-must-not-escape");
  });

  it("refuses a mismatched adaptation binding before durable apply", async () => {
    const apply = vi.fn();
    await expect(applyAutomationStudioRuntimeReauthorAndContinueGrant({
      projectId: adaptation.projectId,
      flowId: adaptation.flowId,
      adaptationId: adaptation.adaptationId,
      actorId: "runtime.result_repair",
      expectedPreviousBinding: { ...previous, settingsRevision: 6 },
      executionGrant: grant,
      withLock: async (callback) => await callback(),
      loadAdaptation: async () => adaptation,
      apply,
      readAppliedBinding: async () => previous
    })).rejects.toThrow("does not match");
    expect(apply).not.toHaveBeenCalled();
  });
});
