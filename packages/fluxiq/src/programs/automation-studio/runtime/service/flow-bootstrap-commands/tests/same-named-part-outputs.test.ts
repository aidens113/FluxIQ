// Two parts of one Flow script that hand back an output of the same name
// (t404's recovery matrix, row 8; contract C12's known alternative always has
// two). Authoring gives a part's interface ports `id: name`, so both parts'
// Subflow graphs carry an output port `cart`. A port id is unique within its
// Flow, not across the project: apply used to fail with
// `UNIQUE constraint failed: flow_ports.port_id` (t405).
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectFlowResourceRepository } from "../../../../storage/project/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";

const resolution = { scope: { kind: "global" as const }, runtimeCapabilities: [], permissions: [] };
const keep = (label: string, value: number, indent = "") => [`${indent}step ${label}: keep ${value}`, `${indent}  node: builtin.data.constant`, `${indent}  value: ${value}`];

const script = [
  "flow: Fill the cart one of two ways",
  ...keep("one", 1),
  "step: fill it the first way",
  "  call: first",
  "step: fill it the second way",
  "  call: second",
  "part first: fill the cart by search",
  "  output: cart = $step.a.value",
  ...keep("a", 2, "  "),
  "end",
  "part second: fill the cart from the list",
  "  output: cart = $step.b.value",
  ...keep("b", 3, "  "),
  "end"
];

function buildPlan(lines: readonly string[]): AutomationStudioFlowBuildPlan {
  const registry = new AutomationStudioNodeRegistry();
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
  if (!validated.validated) throw new Error(JSON.stringify(validated.issues, null, 2));
  return validated.validated;
}

describe("two parts that both declare `output: cart`", () => {
  let tempRoot: string;
  let instance: AutomationStudioService;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-same-named-part-outputs-"));
    instance = new AutomationStudioService({ dataDir: tempRoot });
  });

  afterEach(async () => {
    await instance.close();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("are assembled, applied through the candidate path, and each graph keeps its own `cart` port", async () => {
    const plan = buildPlan(script);
    const parts = plan.subflows.filter((subflow) => subflow.key !== "main");
    expect(parts.map((part) => part.interface?.outputs.map((port) => port.id))).toEqual([["cart"], ["cart"]]);

    const project = await instance.createProject({ name: "Same-named part outputs" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.cart", name: "Blank instruction Flow" });
    const now = Date.now();
    await instance.saveFlowInstruction(project.id, {
      schemaVersion: "0.1",
      instructionId: "instruction.active",
      title: "Build the Flow",
      body: "Build the Flow the script says.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
      priority: 100,
      status: "active",
      requirement: "required",
      createdAt: now,
      updatedAt: now
    });
    const adaptation = await instance.createFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      baseDependencyDigest: await instance.getLlmExecutionDependencyDigest(project.id, flow.flowId),
      sourceInstructionIds: ["instruction.active"],
      summary: "Build the Flow.",
      buildPlan: plan
    });
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, actorId: "reviewer" };
    await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    const applied = await instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });
    expect(applied.status).toBe("applied");

    // Read the saved interface back out of project SQL, one graph Flow at a time.
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: path.join(tempRoot, "programs", "automation-studio") });
    const repository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: project.id });
    try {
      const lease = await pool.acquire(project.id);
      let owners: Array<{ flow_id: string }>;
      try {
        owners = await lease.database.all<{ flow_id: string }>("select flow_id from flow_ports where port_id = 'cart' and direction = 'output' order by flow_id");
      } finally { await lease.release(); }
      expect(owners).toHaveLength(2);
      expect(new Set(owners.map((owner) => owner.flow_id)).size).toBe(2);
      for (const owner of owners) {
        const detail = await repository.getFlow(owner.flow_id);
        expect(detail?.outputs.map((port) => [port.portId, port.name])).toEqual([["cart", "cart"]]);
      }
    } finally {
      await repository.close();
      await pool.closeAll();
    }
  }, 60_000);
});
