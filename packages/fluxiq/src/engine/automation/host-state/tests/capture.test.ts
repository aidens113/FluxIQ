import { describe, expect, it } from "vitest";
import { captureHostState } from "../index.ts";
import { automationStudioRunState } from "../../state/index.ts";
import { runAutomationStudioGraph } from "../../index.ts";

const input = {
  node: { id: "step", definitionId: "builtin.control.start" },
  attemptId: "step.attempt.1",
  inputs: {},
  point: "before_action" as const
};

describe("host state capture availability", () => {
  it("accepts an explicit unsupported-node outcome without creating state evidence", async () => {
    expect(await captureHostState({ hostRuntime: {
      capabilities: ["state-snapshot"],
      captureStateSnapshot: () => ({ kind: "unavailable", reason: "unsupported_node" })
    } }, input, automationStudioRunState())).toBeUndefined();
  });

  it("distinguishes an unbound capture from a capture that failed", async () => {
    expect(await captureHostState({}, input, automationStudioRunState())).toBeUndefined();
    const cause = new Error("capture unavailable");
    await expect(captureHostState({ hostRuntime: {
      capabilities: ["state-snapshot"],
      captureStateSnapshot: () => { throw cause; }
    } }, input, automationStudioRunState())).rejects.toMatchObject({
      message: "The host state capture could not be read.",
      cause
    });
  });

  it("calls inherited capture methods on their original host receiver", async () => {
    class Host {
      readonly capabilities = ["state-snapshot"];
      #snapshot = { stateSnapshotId: "snapshot.1", stateRef: "capture.1", capturedAt: 1 };
      captureStateSnapshot() { return this.#snapshot; }
    }
    const hostRuntime = new Host();
    expect(await captureHostState({ hostRuntime }, input, automationStudioRunState())).toBe(hostRuntime.captureStateSnapshot());
  });

  it("reports a genuine capture fault without exposing its private exception text", async () => {
    const trace = await runAutomationStudioGraph({ flowId: "capture-fault", nodes: [input.node], edges: [] }, {
      retryPolicy: { maxAttempts: 1, backoffMs: [] },
      hostRuntime: {
        capabilities: ["state-snapshot"],
        captureStateSnapshot: () => { throw new Error("private-host-credential-sentinel"); }
      }
    });
    expect(trace.status).toBe("failed");
    expect(trace.attempts[0]?.message).toBe("The host state capture could not be read.");
    expect(JSON.stringify(trace)).not.toContain("private-host-credential-sentinel");
  });
});
