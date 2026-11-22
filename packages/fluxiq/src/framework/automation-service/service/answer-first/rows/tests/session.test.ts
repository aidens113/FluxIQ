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
    expect(ended.metadata).toEqual({ explorationAttempt: { attemptId: "attempt.1", end: "succeeded" }, processingReferenceTimeMs: 100 });
    expect(open.startedAt).toBe(100);
    expect(open.processingReferenceTimeMs).toBe(100);
    for (const session of io.written) expect(session.metadata).not.toHaveProperty("candidateTrial");
  });
  it("preserves a logical processing reference across segments without altering actual runtime timestamps", async () => {
    const io = ports();
    let clock = 500;
    const open = await automationStudioAnswerFirstSession({ ...io, runId: "run.resumed", attemptId: "attempt.1", processingReferenceTimeMs: 100, now: () => clock++ });
    await open.end("succeeded");
    expect(open.startedAt).toBe(500);
    expect(open.processingReferenceTimeMs).toBe(100);
    expect(io.written.map((run) => [run.queuedAt, run.startedAt, run.finishedAt])).toEqual([[1, 500, undefined], [1, 500, 501]]);
    expect(io.written.every((run) => run.metadata?.processingReferenceTimeMs === 100)).toBe(true);
  });
  it("keeps an old carried reference explicitly unavailable and refuses an invalid supplied timestamp", async () => {
    const io = ports();
    const open = await automationStudioAnswerFirstSession({ ...io, runId: "run.old", attemptId: "attempt.1", processingReferenceTimeMs: null, now: () => 500 });
    expect(open.processingReferenceTimeMs).toBeNull();
    expect(io.written[0]?.metadata?.processingReferenceTimeMs).toBeNull();
    await expect(automationStudioAnswerFirstSession({ ...ports(), runId: "run.bad", attemptId: "attempt.1", processingReferenceTimeMs: Number.NaN })).rejects.toThrow("Invalid processing reference");
  });
});
