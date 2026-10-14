import { describe, expect, it } from "vitest";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import {
  AutomationStudioHostResourceScheduler,
  AutomationStudioHostResourceStaleLeaseError,
  type AutomationStudioHostResourcePort
} from "../../../project-agents/host-resources/index.ts";
import { admitAutomationStudioBuildTrialSession, type AutomationStudioBuildTrialAdmissionPorts } from "../index.ts";

/** A domain stub that offers `capacity` separate contexts, each reissued at a higher epoch. */
function stubPort(capacity: number): AutomationStudioHostResourcePort {
  const free = Array.from({ length: capacity }, (_, index) => `context-${index + 1}`);
  let epoch = 0;
  return {
    capacity,
    acquire: () => {
      const resourceKey = free.shift();
      if (!resourceKey) return "at_capacity";
      epoch += 1;
      return { resourceKey, epoch };
    },
    release: (lease) => { free.push(lease.resourceKey); }
  };
}

function admission(scheduler: AutomationStudioHostResourceScheduler, builds: string[] = ["build.1"]) {
  const started: string[] = [];
  const ports: AutomationStudioBuildTrialAdmissionPorts = {
    knownBuild: async (buildId) => builds.includes(buildId),
    leases: scheduler,
    startRuntimeSession: async () => {
      const runId = `subflow-trial.${started.length + 1}`;
      started.push(runId);
      const session: AutomationStudioRuntimeSession = { schemaVersion: "0.1", runId, projectId: "project", targetKind: "flow", targetId: "parent", flowId: "parent", status: "queued", queuedAt: 1, flow: { flowId: "parent" } as AutomationStudioRuntimeSession["flow"] };
      return session;
    }
  };
  return { ports, started };
}

describe("build trial admission", () => {
  it("admits two trials at once while each brief holds a current lease on a capacity-2 host", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(stubPort(2));
    const { ports, started } = admission(scheduler);
    const find = await scheduler.acquire({ role: "builder", briefId: "brief.find" });
    const add = await scheduler.acquire({ role: "builder", briefId: "brief.add" });
    const sessions = await Promise.all([
      admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.find", lease: find }),
      admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: add })
    ]);
    expect(sessions.map((session) => session.runId).sort()).toEqual(["subflow-trial.1", "subflow-trial.2"]);
    expect(started).toHaveLength(2);
  });

  it("refuses a released lease, and a lease reissued to the same brief refuses the old one", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(stubPort(1));
    const { ports, started } = admission(scheduler);
    const first = await scheduler.acquire({ role: "builder", briefId: "brief.add" });
    await scheduler.release(first);
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: first })).rejects.toBeInstanceOf(AutomationStudioHostResourceStaleLeaseError);
    const second = await scheduler.acquire({ role: "builder", briefId: "brief.add" });
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: first })).rejects.toBeInstanceOf(AutomationStudioHostResourceStaleLeaseError);
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: second })).resolves.toMatchObject({ status: "queued" });
    expect(started).toHaveLength(1);
  });

  it("refuses a missing lease, another brief's lease and an unknown build, starting nothing", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(stubPort(2));
    const { ports, started } = admission(scheduler);
    const find = await scheduler.acquire({ role: "builder", briefId: "brief.find" });
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: undefined })).rejects.toThrow("holds no host resource lease");
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease: find })).rejects.toThrow("held by brief brief.find");
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.2", briefId: "brief.find", lease: find })).rejects.toThrow("Build build.2 is not running");
    expect(started).toEqual([]);
  });

  it("refuses a lease released while the build was looked up", async () => {
    const scheduler = new AutomationStudioHostResourceScheduler(stubPort(1));
    const { ports, started } = admission(scheduler);
    const lease = await scheduler.acquire({ role: "builder", briefId: "brief.add" });
    ports.knownBuild = async () => {
      await scheduler.release(lease);
      return true;
    };
    await expect(admitAutomationStudioBuildTrialSession(ports, { buildId: "build.1", briefId: "brief.add", lease })).rejects.toBeInstanceOf(AutomationStudioHostResourceStaleLeaseError);
    expect(started).toEqual([]);
  });
});
