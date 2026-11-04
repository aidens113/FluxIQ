import { describe, expect, it } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import { automationStudioAnswerFirstSession } from "../index.ts";

function ports() {
  const written: AutomationStudioRuntimeSession[] = [];
  const base = { schemaVersion: "0.1", runId: "run.a", projectId: "project", targetKind: "flow", targetId: "flow.a", flowId: "flow.a", status: "queued", queuedAt: 1, flow: {} } as unknown as AutomationStudioRuntimeSession;
  return {
    written,
    openSession: async ({ runId, metadata }: { runId: string; metadata: Record<string, unknown> }) => ({ ...base, runId, metadata }) as AutomationStudioRuntimeSession,
    writeSession: async (session: AutomationStudioRuntimeSession) => {
      written.push(structuredClone(session));
    }
  };
}

describe("automationStudioAnswerFirstSession", () => {
  it("opens as an exploration attempt, never a candidate trial, and ends once", async () => {
    const io = ports();
    let clock = 100;
    const open = await automationStudioAnswerFirstSession({ ...io, runId: "run.a", attemptId: "attempt.1", now: () => clock++ });
    expect(open.session.metadata).toEqual({ explorationAttempt: { attemptId: "attempt.1" } });
    expect(io.written.map((session) => session.status)).toEqual(["running"]);
    await open.end("succeeded");
    await open.end("failed");
    expect(io.written.map((session) => session.status)).toEqual(["running", "succeeded"]);
    const ended = io.written[1]!;
    expect(ended.finishedAt).toBeGreaterThanOrEqual(ended.startedAt!);
    expect(ended.metadata).toEqual({ explorationAttempt: { attemptId: "attempt.1", end: "succeeded" } });
    for (const session of io.written) expect(session.metadata).not.toHaveProperty("candidateTrial");
  });
});
