import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  automationGraphDerivationKeys,
  createAutomationGraphDerivationJob,
  type AutomationGraphDerivationRequest
} from "./derivation-job";

function request(revision: string, ownerKey = "project:flow", validate = true): AutomationGraphDerivationRequest {
  return {
    ownerKey,
    revisionKey: `${ownerKey}:${revision}:${validate}`,
    flowId: ownerKey.split(":").at(-1) ?? "flow",
    flowName: "Flow",
    source: { revision },
    nodeDefinitions: [],
    validationGraph: null,
    validate
  };
}

describe("Automation graph derivation job", () => {
  it("keeps conversion and validation out of the graph runtime render path", () => {
    const runtimeSource = readFileSync(new URL("../live/useAutomationGraphRuntime.ts", import.meta.url), "utf8");
    expect(runtimeSource).toContain("createAutomationGraphDerivationJob()");
    expect(runtimeSource).toContain("pane.activeViewId === automationStudioViewId.flowEditor");
    expect(runtimeSource).toContain("pane.activeViewId === automationStudioViewId.problems");
    expect(runtimeSource).not.toContain("taskFlowToReactFlowGraph");
    expect(runtimeSource).not.toContain("automationPolicyGraphProblems");
    expect(runtimeSource).not.toContain("pane.tabs.includes(automationStudioViewId.flowEditor)");
  });

  it("does no conversion until a displaying connector subscribes and cancels when the last subscriber leaves", () => {
    const queued: Array<{ callback: () => void; cancel: ReturnType<typeof vi.fn> }> = [];
    const convert = vi.fn(() => ({ nodes: [], edges: [] }));
    const job = createAutomationGraphDerivationJob({
      convert,
      schedule(callback) {
        const cancel = vi.fn();
        queued.push({ callback, cancel });
        return cancel;
      }
    });

    job.setRequest(request("1"));
    expect(queued).toHaveLength(0);
    const unsubscribe = job.subscribe(() => undefined);
    expect(queued).toHaveLength(1);
    expect(convert).not.toHaveBeenCalled();
    unsubscribe();
    expect(queued[0]?.cancel).toHaveBeenCalledOnce();
    queued[0]?.callback();
    expect(convert).not.toHaveBeenCalled();
  });

  it("retains the prior graph during a same-flow refresh and rejects stale completion", () => {
    const queued: Array<() => void> = [];
    const convert = vi.fn((source: any) => ({ nodes: [{ id: source.revision } as any], edges: [] }));
    const job = createAutomationGraphDerivationJob({
      convert,
      validate: () => [],
      schedule(callback) {
        queued.push(callback);
        return vi.fn();
      }
    });
    job.subscribe(() => undefined);
    job.setRequest(request("1"));
    queued.shift()?.();
    expect(job.getSnapshot()).toMatchObject({ status: "ready", graph: { nodes: [{ id: "1" }] } });

    job.setRequest(request("2"));
    expect(job.getSnapshot()).toMatchObject({ status: "refreshing", graph: { nodes: [{ id: "1" }] } });
    const stale = queued.shift();
    job.setRequest(request("3"));
    stale?.();
    expect(job.getSnapshot()).toMatchObject({ revisionKey: "project:flow:3:true", graph: { nodes: [{ id: "1" }] } });
    queued.shift()?.();
    expect(job.getSnapshot()).toMatchObject({ status: "ready", graph: { nodes: [{ id: "3" }] } });
  });

  it("clears a retained graph when ownership moves to another flow", () => {
    const queued: Array<() => void> = [];
    const job = createAutomationGraphDerivationJob({
      convert: () => ({ nodes: [], edges: [] }),
      schedule(callback) {
        queued.push(callback);
        return vi.fn();
      }
    });
    job.subscribe(() => undefined);
    job.setRequest(request("1"));
    queued.shift()?.();
    job.setRequest(request("1", "project:other-flow"));
    expect(job.getSnapshot()).toMatchObject({ ownerKey: "project:other-flow", graph: null, problems: [] });
  });

  it("uses constant-time object identity plus explicit source revision in derivation keys", () => {
    const source = { flowId: "flow", graphRevision: 4 };
    const definitions: unknown[] = [];
    const first = automationGraphDerivationKeys({ projectId: "project", source, nodeDefinitions: definitions, validate: false });
    const second = automationGraphDerivationKeys({ projectId: "project", source, nodeDefinitions: definitions, validate: false });
    expect(second).toEqual(first);
    source.graphRevision = 5;
    expect(automationGraphDerivationKeys({ projectId: "project", source, nodeDefinitions: definitions, validate: false }).revisionKey).not.toBe(first.revisionKey);
  });
});
