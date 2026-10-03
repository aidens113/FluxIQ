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
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, caller, isJudgeRequest, judgeReply, mockProvider, plan, copyDataDirSeed, seedDataDir, type DataDirSeed } from "./fixtures.ts";

type DigestAsk = { projectId: string; flowId: string; callId: string; toolId: string; phase: string };

let tempRoot: string;
type Fixture = Awaited<ReturnType<typeof blankFixture>>;

// Every case needs a blank project. Writing one through the service costs about a
// second on an idle machine and several under load, inside each case's 15 s budget,
// so it is written once per file by a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;
let seedRoot: string;
/** One blank `example`-domain project. */
let example: DataDirSeed<Fixture>;

/** Copies a seed into this case's data directory; call it before any service there is constructed. */
async function seeded<T>(seed: DataDirSeed<T>): Promise<T> {
  return structuredClone(await copyDataDirSeed(seed, tempRoot));
}

const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

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

/**
 * One build: look, act (added to the Flow), then complete with a plan that needs
 * nothing permitted. The act is the Flow's one step, so the build's test runs it
 * again (answered by the replaying stand-in, which takes no digest) and the judge
 * of that test says yes: a Flow is finished only on a whole-Flow run judged success.
 */
async function build(options: { digests?: boolean } = {}) {
  const asked: DigestAsk[] = [];
  const decisions: JsonObject[] = [
    { kind: "tool_call", callId: "call.look", toolId: "example.look", input: {} },
    { kind: "tool_call", callId: "call.act", toolId: "example.act", input: {}, add: true },
    { kind: "complete", result: { summary: "Built.", plan: plan() } }
  ];
  let call = 0;
  const provider = mockProvider(async (request) => isJudgeRequest(request) ? judgeReply() : ({
    response: { kind: "evidence_tool_decision", summary: "Step.", decision: decisions[Math.min(call++, decisions.length - 1)]! },
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
  }));
  const { project, flow } = await seeded(example);
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: 6 })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding(binding(asked, options.digests !== false))
  });
  services.add(instance);
  const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: caller() });
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
