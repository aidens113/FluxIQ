// @fluxiq-test-group real-sql
// A run-session whose caller is known (`llmExecution`) falls back to that person's stored starting
// value after the Flow's level and the request's starting value. Seen on the options the engine
// is handed.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioPersonHumanness } from "../../../service/person-humanness/index.ts";

const handed = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("../../../executor/index.ts", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../executor/index.ts")>();
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
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-run-session-person-humanness-"));
  handed.length = 0;
});
afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function run(levels: { flow?: number; start?: number; person: number | null }, known: boolean | "person-only" = true) {
  const service = new AutomationStudioService({ dataDir: path.join(tempRoot, String(services.size)) });
  services.add(service);
  AutomationStudioPersonHumanness.bind(service, (userId) => (userId === "person.one" ? levels.person : null));
  const project = await service.createProject({ name: "Humanness", domainId: "example" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.humanness", name: "Humanness", ...(levels.flow === undefined ? {} : { humanness: levels.flow }) });
  const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(project.id, subflow.graphFlowId!);
  await service.saveFlow({ projectId: project.id, flow: { ...blank,
    nodes: [{ id: "start", definitionId: "builtin.control.start", parameterValues: {} }, { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }],
    edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }] } });
  await service.setFlowMapFallback({ projectId: project.id, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Finish." });
  handed.length = 0;
  const result = await service.runRuntimeSession({
    projectId: project.id,
    flowId: flow.flowId,
    ...(levels.start === undefined ? {} : { humanness: levels.start }),
    ...(known === true ? { llmExecution: { actorUserId: "person.one", actorSessionId: "session.one", intent: "diagnosis_only" as const } } : {}),
    // A signed-in caller with no unlocked key: the run request names the person on its own (`run-requests/run-session.ts`).
    ...(known === "person-only" ? { personUserId: "person.one" } : {})
  });
  expect(result.status).toBe("succeeded");
  return handed[handed.length - 1]!;
}

describe("a run-session's humanness with its person known", () => {
  it("falls back to the person's stored value last", async () => {
    expect((await run({ person: 55 })).humanness).toBe(55);
  });
  it("takes the request's starting value over the person's", async () => {
    expect((await run({ start: 20, person: 55 })).humanness).toBe(20);
  });
  it("takes the Flow's stored level over both", async () => {
    expect((await run({ flow: 40, start: 20, person: 55 })).humanness).toBe(40);
  });
  it("knows the person from the signed-in caller even with no unlocked key", async () => {
    expect((await run({ person: 55 }, "person-only")).humanness).toBe(55);
    expect((await run({ start: 20, person: 55 }, "person-only")).humanness).toBe(20);
  });
  it("has none when the person set none, or the person is not known", async () => {
    expect(await run({ person: null })).not.toHaveProperty("humanness");
    expect(await run({ person: 55 }, false)).not.toHaveProperty("humanness");
  });
});
