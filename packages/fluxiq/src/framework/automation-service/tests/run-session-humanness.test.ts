// @fluxiq-test-group real-sql
// A Flow run started through `runRuntimeSession` takes its humanness by precedence: the Flow's stored level,
// then the request's starting value, then none (today's path). Seen on the options the engine is handed.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../service.ts";

const handed = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("../executor/index.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../executor/index.ts")>();
  return {
    ...real,
    runAutomationStudioGraph: (flow: Parameters<typeof real.runAutomationStudioGraph>[0], options: Parameters<typeof real.runAutomationStudioGraph>[1]) => {
      handed.push(options as unknown as Record<string, unknown>);
      return real.runAutomationStudioGraph(flow, options);
    }
  };
});

let tempRoot: string;
const services = new Set<AutomationStudioService>();
beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-session-humanness-"));
  handed.length = 0;
});
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function flowWith(humanness?: number) {
  const service = new AutomationStudioService({ dataDir: tempRoot });
  services.add(service);
  const project = await service.createProject({ name: "Humanness", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.humanness", name: "Humanness", ...(humanness === undefined ? {} : { humanness }) });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({ projectId: project.id, flow: { ...blank,
    nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: {} }, { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }],
    edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }] } });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Finish." });
  return { service, projectId: project.id, flowId: flow.flowId };
}

async function run(humanness: { flow?: number; start?: number }) {
  const { service, projectId, flowId } = await flowWith(humanness.flow);
  const result = await service.runRuntimeSession({ projectId, flowId, ...(humanness.start === undefined ? {} : { humanness: humanness.start }) });
  expect(result.status).toBe("succeeded");
  expect(handed.length).toBeGreaterThan(0);
  return handed[handed.length - 1]!;
}

describe("a run-session's humanness", () => {
  it("takes the Flow's stored level over the starting value", async () => {
    expect((await run({ flow: 40, start: 90 })).humanness).toBe(40);
  });
  it("a stored 0 beats the starting value", async () => {
    expect((await run({ flow: 0, start: 90 })).humanness).toBe(0);
  });
  it("takes the starting value when the Flow has no level", async () => {
    expect((await run({ start: 90 })).humanness).toBe(90);
  });
  it("has none when neither is given", async () => {
    expect(await run({})).not.toHaveProperty("humanness");
  });
});
