// A project build through the actual service (unit A5c): a scripted model
// plays the supervisor -- plan, dispatch, assemble, test, complete -- and each
// builder -- submit its subflow, test it, complete -- while the service's real
// dispatcher, subflow trials, whole-candidate trial and build-test judges run
// over the mock provider. A judged yes on the whole candidate proposes it
// through the candidate's own promotion; a no keeps it as a draft. Builders
// are scheduled on a stub host at capacity 2 (two independent subflows built
// at once) and capacity 1 (one at a time).

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioHostResourceAcquireResult, AutomationStudioHostResourceHolder, AutomationStudioHostResourcePort } from "../../../project-agents/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The fixture instruction's words (`blankFixture`): every part is a verbatim span of them. */
const TASK = "Create a deterministic Start to End Flow.";
const START_END = {
  nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
  edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
};

/** Each planned subflow's success check, which a builder's proposal carries unchanged; a fresh object each time, as a parsed reply's would be. */
const checked = () => ({ metadata: { "fluxiq.successCheck": [{ fact: "ended", op: "exists" }] } });

type Shape = "one_part" | "two_parts";
type Entry = { callId: string; toolId: string; value: unknown };

/** The plan the scripted supervisor writes: one router-run subflow, or a router-run subflow calling two independent parts. */
function planInput(shape: Shape): JsonObject {
  const router = { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } };
  if (shape === "one_part") {
    return {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
      structurePlan: { plan: { router, subflows: [{ key: "main", name: "Main", role: "primary", ...checked() }] }, partOf: { main: ["p1"] } }
    };
  }
  const callable = (key: string) => ({ key, name: key, role: "utility", interface: { inputs: [], outputs: [] }, ...checked() });
  return {
    taskSpec: {
      parts: [
        { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: [] },
        { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }
      ],
      notAsked: []
    },
    structurePlan: { plan: { router, subflows: [{ key: "main", name: "Main", role: "primary", ...checked() }, callable("first"), callable("second")] }, partOf: { main: [], first: ["p1"], second: ["p2"] } }
  };
}

function briefs(shape: Shape): JsonObject[] {
  const brief = (subflowKey: string, parts: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 });
  return shape === "one_part" ? [brief("main", ["p1"])] : [brief("first", ["p1"]), brief("second", ["p2"])];
}

/** What a builder submits: for the router-run subflow a plan of a start and an end; for a part, the script of one short wait. */
function submission(subflowKey: string): JsonObject {
  if (subflowKey !== "main") return { flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, "  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds", "end"].join("\n") };
  return {
    summary: "Build the main subflow",
    plan: { schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary", ...START_END }] }
  };
}

const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

/** A host port that grants up to `capacity` resources and keeps the most it ever had out at once. */
class CountingHost implements AutomationStudioHostResourcePort {
  held = 0;
  most = 0;
  readonly holders: string[] = [];
  private epoch = 0;
  constructor(readonly capacity: number) {}
  async acquire(holder: AutomationStudioHostResourceHolder): Promise<AutomationStudioHostResourceAcquireResult> {
    await Promise.resolve();
    if (this.held >= this.capacity) return "at_capacity";
    this.held += 1;
    this.most = Math.max(this.most, this.held);
    this.holders.push(holder.briefId);
    this.epoch += 1;
    return { resourceKey: `resource-${this.held}`, epoch: this.epoch };
  }
  async release(): Promise<void> {
    await Promise.resolve();
    this.held -= 1;
  }
}

async function projectBuild(options: { shape?: Shape; whole?: "yes" | "no"; capacity?: number } = {}) {
  const shape = options.shape ?? "one_part";
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-facade-"));
  const judged = { whole: [] as AutomationStudioLlmTaskRequest[], subflow: [] as AutomationStudioLlmTaskRequest[] };
  const offered: string[][] = [];
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") {
      const scoped = JSON.stringify(request.context).includes("This trial ran only the subflow");
      (scoped ? judged.subflow : judged.whole).push(request);
      return judgeReply(scoped ? "yes" : options.whole ?? "yes");
    }
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    const tools = loop.tools.map((tool) => tool.toolId);
    offered.push(tools);
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
      switch (supervisorDecisions) {
        case 1: return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: planInput(shape) });
        case 2: return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build each subflow the plan needs.", briefs: briefs(shape) } });
        case 3: return decision({ kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} });
        case 4: return decision({ kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: assembled ?? {} });
        default: {
          const verdict = lastOf(evidence, "core.test_candidate")?.verdict;
          return decision({ kind: "complete", result: verdict === "yes" ? assembled ?? {} : { ended: "partial", reason: "The whole Flow's trial was judged not to do what was asked." } });
        }
      }
    }
    const subflowKey = ((loop.completionSchema.properties as JsonObject | undefined)?.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: `submit-${subflowKey}`, toolId: "core.submit_subflow", input: submission(subflowKey) });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: `test-${subflowKey}`, toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const host = options.capacity === undefined ? undefined : new CountingHost(options.capacity);
  const serviceOptions: AutomationStudioServiceOptions = {
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) },
    ...(host ? { hostRuntime: { capabilities: [], hostResources: host } } : {})
  };
  const service = new AutomationStudioService(serviceOptions);
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { project, flow } = await blankFixture(service);
  const proposed = vi.spyOn(service, "createFlowBootstrapAdaptation");
  return {
    service, projectId: project.id, flowId: flow.flowId, judged, offered, host, proposed,
    build: (extra: { mode?: "extend" } = {}) => service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", ...extra })
  };
}

describe("a project build through the actual service", () => {
  it("plans a one-part task, builds and tries its subflow, assembles, and proposes the whole Flow on a judged yes", async () => {
    const run = await projectBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(result.candidate).toMatchObject({ trial: { verdict: "yes" } });
    expect(run.proposed).toHaveBeenCalledTimes(1);
    // One subflow trial, judged on the brief's parts alone, then the whole trial, each a first answer and its confirmation.
    expect(run.judged.subflow).toHaveLength(2);
    expect(run.judged.whole).toHaveLength(2);
    for (const request of run.judged.subflow) expect(JSON.stringify(request.context)).toContain(TASK);
    // The supervisor is offered its own tools and never a builder's; each builder its own, never the supervisor's.
    expect(run.offered.some((tools) => tools.includes("project.dispatch") && !tools.includes("core.submit_subflow"))).toBe(true);
    expect(run.offered.some((tools) => tools.includes("core.submit_subflow") && !tools.includes("project.dispatch"))).toBe(true);
  });

  it("keeps the assembled Flow as a draft when the whole trial is judged no, and proposes nothing", async () => {
    const run = await projectBuild({ whole: "no" });
    const result = await run.build();
    expect(result).toMatchObject({ status: "draft", verification: "not_performed", promotionAllowed: false, trial: { verdict: "no" } });
    if (result.status !== "draft") throw new Error("expected a draft");
    const store = (run.service as unknown as { candidateDrafts: { get(projectId: string, flowId: string): Promise<unknown> } }).candidateDrafts;
    expect(await store.get(run.projectId, run.flowId)).toMatchObject({ candidateId: result.candidateId, candidate: { revision: result.revision, digest: result.digest } });
    expect(run.proposed).not.toHaveBeenCalled();
  });

  it("builds two independent subflows at once on a host of capacity 2, and proposes the Flow that calls both", async () => {
    const run = await projectBuild({ shape: "two_parts", capacity: 2 });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(run.host!.most).toBe(2);
    expect(run.host!.holders).toHaveLength(2);
    expect(run.host!.held).toBe(0);
    expect(run.judged.subflow).toHaveLength(4);
  });

  it("builds them one at a time on a host of capacity 1", async () => {
    const run = await projectBuild({ shape: "two_parts", capacity: 1 });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(run.host!.most).toBe(1);
    expect(run.host!.holders).toHaveLength(2);
    expect(run.host!.held).toBe(0);
  });

  it("refuses a project build that would extend the Flow, before any model call", async () => {
    const run = await projectBuild();
    await expect(run.build({ mode: "extend" })).rejects.toThrow();
    expect(run.offered).toEqual([]);
    expect(run.proposed).not.toHaveBeenCalled();
  });
});
