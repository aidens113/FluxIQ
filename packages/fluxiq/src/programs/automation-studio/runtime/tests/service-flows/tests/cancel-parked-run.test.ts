// Cancelling a run through the real service settles the wait of a run that was
// parked on a question, and says nothing about a run that was not.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { automationStudioParkedRun, automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft } from "../../../parking/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow } from "../../service-fixtures.ts";

let tempRoot: string;
let service: AutomationStudioService;
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cancel-parked-run-"));
  service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});

afterEach(async () => {
  unsubscribe();
  await service.close();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

/** A queued run, rewritten on disk as `status` -- parked on a person-needed ask when `parked`. */
async function storedRun(status: "waiting" | "running", parked: boolean): Promise<{ projectId: string; runId: string }> {
  const project = await service.createProject({ name: "Cancel parked run" });
  const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.cancel-parked" });
  const queued = await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });
  const file = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "runtime", "sessions", `${queued.runId}.json`);
  // The program-state envelope the service writes: `{ version: 1, data: { session } }`.
  const stored = JSON.parse(await readFile(file, "utf8")) as { version: 1; data: { session: Record<string, unknown> } };
  const ask = automationStudioPersonNeededAsk({ ...automationStudioPersonNeededAskDraft({}), askId: "person-needed.cancel" }, { stage: "execution" });
  const trace = {
    status,
    startedAt: queued.queuedAt,
    attempts: [],
    values: {},
    effects: [],
    ...(parked ? { parked: automationStudioParkedRun({ ask, nodeId: "constant", definitionId: "builtin.data.constant", attemptId: "constant.attempt.1", parkedAtMs: queued.queuedAt, carried: { variables: {}, loops: {}, stepsTaken: 1, maxSteps: 10 } }) } : {})
  };
  await writeFile(file, JSON.stringify({ ...stored, data: { session: { ...stored.data.session, status, startedAt: queued.queuedAt, trace } } }));
  expect((await service.getRuntimeSession(project.id, queued.runId))?.status).toBe(status);
  seen = [];
  return { projectId: project.id, runId: queued.runId };
}

describe("cancelling a run", () => {
  it("settles a parked run's wait as cancelled, once, under the parked ask's ref", async () => {
    const { projectId, runId } = await storedRun("waiting", true);
    const cancelled = await service.cancelRuntimeSession(projectId, runId, "Operator stopped the run.");
    expect(cancelled?.status).toBe("cancelled");
    const settled = seen.filter((event) => event.detail?.resolution !== undefined);
    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({
      activityId: `run:${runId}`,
      subject: { kind: "run", id: runId, projectId },
      detail: { kind: "ask", ref: "person-needed.cancel", title: "Asked the person to complete a check", status: "failed", resolution: "cancelled" }
    });
  });

  it("says no resolution for a run that was not parked", async () => {
    const { projectId, runId } = await storedRun("running", false);
    const cancelled = await service.cancelRuntimeSession(projectId, runId);
    expect(cancelled?.status).toBe("cancelled");
    expect(seen.filter((event) => event.detail?.kind === "ask")).toEqual([]);
  });

  it("says nothing again for a run already cancelled", async () => {
    const { projectId, runId } = await storedRun("waiting", true);
    await service.cancelRuntimeSession(projectId, runId);
    seen = [];
    await service.cancelRuntimeSession(projectId, runId);
    expect(seen).toEqual([]);
  });
});
