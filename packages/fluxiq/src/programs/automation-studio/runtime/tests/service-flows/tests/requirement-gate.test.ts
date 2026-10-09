import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AUTOMATION_STUDIO_REQUIREMENT_IDS, AutomationStudioRunRequirementError } from "../../../service/runtime-session/index.ts";

// The requirement gate wired into a real run (C10): a Subflow graph that
// requires a host capability no connected client offers is refused before any
// step, the session ends failed with the plain reason, and the same Flow
// without `requires` runs as it always did.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-requirement-gate-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function flowRequiring(service: AutomationStudioService, projectId: string, requires: string[] | undefined) {
  const flow = await service.createFlow({ projectId, flowId: "flow.requirement-gate", name: "Requirement gate" });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  const blank = await service.getFlow(projectId, subflow.graphFlowId!);
  await service.saveFlow({
    projectId,
    flow: {
      ...blank,
      ...(requires ? { metadata: { ...(blank.metadata ?? {}), requires } } : {}),
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }]
    }
  });
  await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  return flow;
}

function startService(): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot });
  services.add(service);
  return service;
}

describe("a run whose Subflow graph declares requirements", () => {
  it("is refused before any step when no connected client offers a required capability", { timeout: 120_000 }, async () => {
    const service = startService();
    const project = await service.createProject({ name: "Requirement gate" });
    const flow = await flowRequiring(service, project.id, [AUTOMATION_STUDIO_REQUIREMENT_IDS.webFacts]);

    const refused = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId }).then(() => null, (error: unknown) => error);

    expect(refused).toBeInstanceOf(AutomationStudioRunRequirementError);
    expect((refused as Error).message).toContain("This automation needs page facts");
    const [session] = await service.listRuntimeSessions(project.id);
    expect(session?.status).toBe("failed");
    expect(session?.trace?.attempts ?? []).toHaveLength(0);
    expect(JSON.stringify(session)).toContain("This automation needs page facts");
  });

  it("runs unchanged when the graph declares nothing", { timeout: 120_000 }, async () => {
    const service = startService();
    const project = await service.createProject({ name: "Requirement gate" });
    const flow = await flowRequiring(service, project.id, undefined);

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    expect(run.status).toBe("succeeded");
  });
});
