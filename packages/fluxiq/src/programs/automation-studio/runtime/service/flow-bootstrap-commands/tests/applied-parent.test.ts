// What applying a Flow Bootstrap writes on the parent Flow, `requires` above
// all (contract C10): a Flow whose script holds a handler or calls a part says
// so on the parent itself, and one holding neither says nothing.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBuildPlan } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioBootstrapAppliedParent } from "../index.ts";

const resolution = { scope: { kind: "global" as const }, runtimeCapabilities: [], permissions: [] };
const keep = (label: string, value: number, indent = "") => [`${indent}step ${label}: keep ${value}`, `${indent}  node: builtin.data.constant`, `${indent}  value: ${value}`];

/** A script, read and validated as the plan a candidate is saved with. */
function buildPlan(lines: readonly string[]): AutomationStudioFlowBuildPlan {
  const registry = new AutomationStudioNodeRegistry();
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues, null, 2));
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution });
  if (!validated.validated) throw new Error(JSON.stringify(validated.issues, null, 2));
  return validated.validated;
}

const plain = ["flow: Keep one", ...keep("one", 1)];
const calling = ["flow: Keep one, then a part", ...keep("one", 1), "step: run the part", "  call: tally", "part tally: keep two", ...keep("two", 2, "  "), "end"];
const handling = [
  "flow: Keep one, minding a notice",
  ...keep("one", 1),
  "on retry for one: a notice covers the page",
  "  when: dialog alertdialog \"Please wait\"",
  ...keep("two", 2, "  "),
  "  then: carry on",
  "end"
];
// A handler written `everywhere` lives in the automation's `recovery` Subflow,
// whose graph is saved before its Subflow record exists; apply names the role.
const handlingEverywhere = [
  "flow: Keep one, minding a notice anywhere",
  ...keep("one", 1),
  "on retry everywhere: a notice covers the page",
  "  when: dialog alertdialog \"Please wait\"",
  ...keep("two", 2, "  "),
  "  then: carry on",
  "end"
];

describe("the parent Flow apply saves", () => {
  const parent = createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent", projectId: "project.parent", name: "Parent", now: 1, metadata: { kept: true } });
  const topology = (requires?: string[]) => (requires ? { requires } : {});

  it("names the adaptation and its instructions, keeps what the parent held, and writes what the Flow requires", () => {
    const applied = automationStudioBootstrapAppliedParent(parent, { adaptationId: "adaptation.1", sourceInstructionIds: ["instruction.1"], topology: topology(["flow.subflow-calls@1"]) });
    expect(applied.metadata).toEqual({ ...parent.metadata, bootstrapAdaptationId: "adaptation.1", bootstrapSourceInstructionIds: ["instruction.1"], requires: ["flow.subflow-calls@1"] });
    expect(applied.metadata?.kept).toBe(true);
    expect(parent.metadata).not.toHaveProperty("requires");
  });

  it("writes no `requires` when the topology requires nothing, and joins an earlier build's", () => {
    expect(automationStudioBootstrapAppliedParent(parent, { adaptationId: "adaptation.1", sourceInstructionIds: [], topology: topology() }).metadata).not.toHaveProperty("requires");
    const earlier = { ...parent, metadata: { requires: ["flow.handlers@1"] } };
    expect(automationStudioBootstrapAppliedParent(earlier, { adaptationId: "adaptation.2", sourceInstructionIds: [], topology: topology() }).metadata?.requires).toEqual(["flow.handlers@1"]);
    expect(automationStudioBootstrapAppliedParent(earlier, { adaptationId: "adaptation.2", sourceInstructionIds: [], topology: topology(["flow.subflow-calls@1", "flow.handlers@1"]) }).metadata?.requires)
      .toEqual(["flow.handlers@1", "flow.subflow-calls@1"]);
  });
});

describe("applying a candidate through the service", () => {
  let tempRoot: string;
  let instance: AutomationStudioService;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-applied-requires-"));
    instance = new AutomationStudioService({ dataDir: tempRoot });
  });

  afterEach(async () => {
    await instance.close();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  /** The parent Flow's metadata once a candidate built from the script is approved and applied. */
  async function appliedParentMetadata(lines: readonly string[]) {
    const project = await instance.createProject({ name: "Applied requires" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.requires", name: "Blank instruction Flow" });
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
      buildPlan: buildPlan(lines)
    });
    const review = { projectId: project.id, flowId: flow.flowId, adaptationId: adaptation.adaptationId, actorId: "reviewer" };
    await instance.reviewFlowBootstrapAdaptation({ ...review, action: "approve" });
    const applied = await instance.reviewFlowBootstrapAdaptation({ ...review, action: "apply" });
    expect(applied.status).toBe("applied");
    return (await instance.getFlow(project.id, flow.flowId)).metadata;
  }

  it("writes `requires` on the parent of a Flow that calls a part", async () => {
    expect((await appliedParentMetadata(calling))?.requires).toEqual(["flow.subflow-calls@1"]);
  }, 60_000);

  it("writes `requires` on the parent of a Flow that holds a handler", async () => {
    expect((await appliedParentMetadata(handling))?.requires).toEqual(["flow.handlers@1", "web.facts@1"]);
  }, 60_000);

  it("applies a Flow whose handler applies everywhere, in the recovery Subflow", async () => {
    expect((await appliedParentMetadata(handlingEverywhere))?.requires).toEqual(["flow.handlers@1", "web.facts@1"]);
  }, 60_000);

  it("writes none on the parent of a Flow that holds neither", async () => {
    const metadata = await appliedParentMetadata(plain);
    expect(metadata?.bootstrapAdaptationId).toBeTypeOf("string");
    expect(metadata).not.toHaveProperty("requires");
  }, 60_000);
});
