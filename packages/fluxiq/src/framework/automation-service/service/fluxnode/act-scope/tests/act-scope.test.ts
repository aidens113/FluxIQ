// @fluxiq-test-group real-sql
// A FluxNode run's act scope (`../act-scope.ts`) and the record a resumable run is continued with
// (`../act-records.ts`), on a real service's task memory. Provider-free: no model, no site.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { AutomationStudioService } from "../../../../service.ts";
import { automationStudioAnswerFirstTaskKey } from "../../../answer-first/task-key/index.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../../answer-first/task-memory/index.ts";
import { FluxNodeActRecords, fluxNodeActScope } from "../index.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a FluxNode run's act scope", () => {
  it("is the run's own without a key, and the key's with the same request whichever run carries it", () => {
    expect(fluxNodeActScope({ runId: "fnr-1" })).toBe("fluxnode.run.fnr-1");
    const request = { name: "library.renew-card", inputs: { note: "moving house" }, idempotencyKey: "k-1" };
    const keyed = fluxNodeActScope({ runId: "fnr-1", key: { key: "k-1", request } });
    expect(fluxNodeActScope({ runId: "fnr-2", key: { key: "k-1", request: { idempotencyKey: "k-1", inputs: { note: "moving house" }, name: "library.renew-card" } } })).toBe(keyed);
    expect(fluxNodeActScope({ runId: "fnr-1", key: { key: "k-2", request } })).not.toBe(keyed);
    expect(fluxNodeActScope({ runId: "fnr-1", key: { key: "k-1", request: { ...request, inputs: { note: "new address" } } } })).not.toBe(keyed);
    // Only a digest of the request is kept, never its inputs.
    expect(keyed).toMatch(/^fluxnode\.key\.[0-9a-f]{64}$/u);
  });
});

describe("the act record a resumable run is continued with", () => {
  it("is held when the run ends and put back for its resume where another run's replaced it", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-act-scope-"));
    const service = new AutomationStudioService({ dataDir });
    cleanups.push(async () => {
      await service.close();
      await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
    });
    const { id: projectId } = await service.createProject({ name: "Library", domainId: "library" });
    const memory = automationStudioAnswerFirstTaskMemoryOf(service, { paths: service.projectPaths, projects: service.projects });
    const at = { projectId, taskKey: `fluxnode:library.renew-card:${"a".repeat(64)}` };
    const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: at.taskKey });
    const data = new AutomationStudioAttemptActRecord().data();
    const attempt = (attemptId: string, actScope: string) => ({ attemptId, flowId: "flow.renew", ordinal: 1, route: "build" as const, caller: { taskKey: at.taskKey, actScope }, steps: [] });
    const actedLast = async (attemptId: string, actScope: string) => await memory.update(projectId, taskId, (current) => ({ ...current, flowId: "flow.renew", attempts: [...current.attempts, attempt(attemptId, actScope)], acts: { attemptId, flowId: "flow.renew", data } }));
    const records = new FluxNodeActRecords(service);

    await actedLast("attempt.first", "fluxnode.run.fnr-1");
    await records.keep(at, "fluxnode.run.fnr-1");
    // Held only for its own scope: a record of another execution is never held for this one.
    await records.keep(at, "fluxnode.run.fnr-other");
    await actedLast("attempt.other", "fluxnode.run.fnr-2");

    await records.restore(at, "fluxnode.run.fnr-other");
    expect((await memory.get(projectId, taskId))?.acts?.attemptId).toBe("attempt.other");
    await records.restore(at, "fluxnode.run.fnr-1");
    expect((await memory.get(projectId, taskId))?.acts?.attemptId).toBe("attempt.first");
    // Put back once: the resume's own attempt carries it from here.
    await actedLast("attempt.third", "fluxnode.run.fnr-3");
    await records.restore(at, "fluxnode.run.fnr-1");
    expect((await memory.get(projectId, taskId))?.acts?.attemptId).toBe("attempt.third");
  });
});
