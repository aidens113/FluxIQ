// Two things a finished build should carry and used not to: the state either
// side of each step it ran, and what each step actually did.
//
// Both go through the real `generateFlowBootstrapAdaptation` with a scripted
// provider and a stand-in domain, because both are wiring: a hook the service
// never passed, and two fields the service's own sanitizer dropped on the way
// to storage. A row that called either module directly would pass while nothing
// invoked it.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, grant, mockProvider, plan } from "./fixtures.ts";

type DigestAsk = { projectId: string; flowId: string; callId: string; toolId: string; phase: string };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-digest-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

describe("what a build records about the steps it ran", () => {
  it("asks the domain for the state either side of every step, in order, naming the call", async () => {
    const run = await build();
    const result = await run.generation;

    expect(result.status).toBe("proposed");
    // Two per call, before then after, and never derived one from the other:
    // the reduction reads the chain and reports a break between two steps.
    expect(run.asked).toEqual([
      { projectId: run.project.id, flowId: run.flow.flowId, callId: "call.look", toolId: "example.look", phase: "before" },
      { projectId: run.project.id, flowId: run.flow.flowId, callId: "call.look", toolId: "example.look", phase: "after" },
      { projectId: run.project.id, flowId: run.flow.flowId, callId: "call.act", toolId: "example.act", phase: "before" },
      { projectId: run.project.id, flowId: run.flow.flowId, callId: "call.act", toolId: "example.act", phase: "after" }
    ]);
  });

  it("keeps what each step did in the stored trace, not only the tool it named", async () => {
    const run = await build();
    const result = await run.generation;
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);

    expect(stored!.evidenceTrace?.map((step) => ({ toolId: step.toolId, effectApplied: step.effectApplied, resultCode: step.resultCode }))).toEqual([
      // A look: no effect flag, because the tool cannot change anything.
      { toolId: "example.look", effectApplied: undefined, resultCode: "example.looked" },
      // An action: whether it applied, and the code it came back with.
      { toolId: "example.act", effectApplied: true, resultCode: "example.acted" },
      { toolId: undefined, effectApplied: undefined, resultCode: undefined }
    ]);
  });

  it("takes no digest at all from a domain that cannot observe its own state", async () => {
    const run = await build({ digests: false });

    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
    expect(run.asked).toEqual([]);
  });
});

/** One build: look, act, then complete with a plan that needs nothing permitted. */
async function build(options: { digests?: boolean } = {}) {
  const asked: DigestAsk[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.look", toolId: "example.look", input: {} },
    { kind: "tool_call", callId: "call.act", toolId: "example.act", input: {} },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  let call = 0;
  const provider = mockProvider(async () => ({
    response: { kind: "evidence_tool_decision", summary: "Step.", decision: decisions[Math.min(call++, decisions.length - 1)]! },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
  }));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never,
    llmEvidenceRuntime: binding(asked, options.digests !== false)
  });
  services.add(instance);
  const { project, flow } = await blankFixture(instance, "active", "example");
  const executionGrant = await grant(instance, project.id, flow.flowId);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, executionGrant });
  return { instance, project, flow, asked, generation };
}

/** A domain with one look and one action, and a state it can describe -- or cannot. */
function binding(asked: DigestAsk[], digests: boolean): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [
      { toolId: "example.look", description: "Look at the target.", inputSchema: { type: "object" }, effect: "observe" },
      { toolId: "example.act", description: "Change the target.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool: async (input) => input.toolId === "example.look"
      ? { kind: "llm_evidence_tool_execution", evidence: { saw: "a target" }, effectApplied: false, resultCode: "example.looked" }
      : { kind: "llm_evidence_tool_execution", evidence: { changed: true }, effectApplied: true, resultCode: "example.acted" },
    ...(digests ? {
      captureStateDigest: async (input) => {
        asked.push({ projectId: input.projectId, flowId: input.flowId, callId: input.callId, toolId: input.toolId, phase: input.phase });
        return `state.${asked.length}`;
      }
    } : {})
  };
}
