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

/** What the two-part task spec says nobody asked for (unit A9: every judge is sent it beside the instructions). */
const NOT_ASKED = "Waiting longer than the Flow needs";

type Shape = "one_part" | "two_parts";
type Entry = { callId: string; toolId: string; value: unknown };

/** The plan the scripted supervisor writes in its planning format: one router-run subflow, or two independent parts Core's router-run subflow calls. */
function planInput(shape: Shape): JsonObject {
  if (shape === "one_part") {
    return {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
      subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
    };
  }
  return {
    taskSpec: {
      parts: [
        { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: [] },
        { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }
      ],
      notAsked: [NOT_ASKED]
    },
    subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"] }]
  };
}

function briefs(shape: Shape): JsonObject[] {
  const brief = (subflowKey: string, parts: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 });
  return shape === "one_part" ? [brief("main", ["p1"])] : [brief("first", ["p1"]), brief("second", ["p2"])];
}

/** What a builder submits: for the router-run subflow a plan of a start and an end; for a part, the script of one short wait. */
function submission(subflowKey: string, proposedCheck?: JsonObject[]): JsonObject {
  if (subflowKey !== "main") return { flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, "  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds", "end"].join("\n") };
  return {
    summary: "Build the main subflow",
    plan: { schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary", ...START_END, ...(proposedCheck ? { metadata: { "fluxiq.successCheck": proposedCheck } } : {}) }] }
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

async function projectBuild(options: { shape?: Shape; whole?: "yes" | "no"; capacity?: number; domainText?: string; proposedCheck?: JsonObject[] } = {}) {
  const shape = options.shape ?? "one_part";
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-facade-"));
  const judged = { whole: [] as AutomationStudioLlmTaskRequest[], subflow: [] as AutomationStudioLlmTaskRequest[] };
  const offered: string[][] = [];
  /** The system instructions each evidence decision carried, by whether the supervisor or a builder asked. */
  const instructed: Array<{ supervisor: boolean; instructions: AutomationStudioLlmTaskRequest["domainInstructions"] }> = [];
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
    instructed.push({ supervisor: tools.includes("project.write_plan"), instructions: request.domainInstructions });
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
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: `submit-${subflowKey}`, toolId: "core.submit_subflow", input: submission(subflowKey, options.proposedCheck) });
    if (tested?.verdict !== "yes") return decision({ kind: "tool_call", callId: `test-${subflowKey}`, toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const host = options.capacity === undefined ? undefined : new CountingHost(options.capacity);
  const serviceOptions: AutomationStudioServiceOptions = {
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }),
      ...(options.domainText ? { systemInstructions: { version: "isolated.v1", text: options.domainText } } : {}) },
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
    service, projectId: project.id, flowId: flow.flowId, judged, offered, instructed, host, proposed,
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

  // The first live project builds sent the supervisor the web domain's operating text, which undid its role (t569).
  it("tells the supervisor its own role and host, never the domain's operating text, while builders keep the domain's", async () => {
    const operating = "You operate a real website in the person's own browser. To reach a thing, use the site's own search and submit it.";
    const run = await projectBuild({ domainText: operating });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    const supervisor = run.instructed.filter((entry) => entry.supervisor);
    const builders = run.instructed.filter((entry) => !entry.supervisor);
    expect(supervisor.length).toBeGreaterThan(0);
    expect(builders.length).toBeGreaterThan(0);
    for (const { instructions } of supervisor) {
      expect(instructions).toMatchObject({ domainId: "fluxiq.project-supervisor", version: "project-supervisor.1" });
      expect(instructions!.text).toContain("You are the project supervisor of a FluxIQ build");
      expect(instructions!.text).toContain("You do not operate the target");
      expect(instructions!.text).toContain("This build runs on the host of the domain \"isolated\"");
      expect(instructions!.text).not.toContain("You operate a real website");
      expect(instructions!.text).not.toContain("own search");
    }
    for (const { instructions } of builders) expect(instructions).toEqual({ domainId: "isolated", version: "isolated.v1", text: operating });
  });

  // The plan the supervisor writes gives no success check, so the builder's own is its subflow's, and its trial is judged against it (t569).
  it("judges a subflow's trial against the success check its builder proposed when the plan gives none", async () => {
    const proposed = [{ fact: "ended", op: "exists" }];
    const run = await projectBuild({ proposedCheck: proposed });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(run.judged.subflow.length).toBeGreaterThan(0);
    for (const request of run.judged.subflow) {
      expect(JSON.stringify(request.context)).toContain(JSON.stringify(`Its success check, as its builder proposed it (the plan gives none): ${JSON.stringify(proposed)}`).slice(1, -1));
    }
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

  it("judges each subflow trial on its brief's part and the whole trial on every part, each beside what nobody asked for", async () => {
    const run = await projectBuild({ shape: "two_parts", capacity: 1 });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    type Section = { supplementary: string; asked: Array<{ part: string; words: string }>; notAsked: string[] };
    const sectionOf = (request: AutomationStudioLlmTaskRequest) => (request.context.resultSummary as unknown as { taskChecklist?: Section }).taskChecklist;
    expect(run.judged.subflow).toHaveLength(4);
    const judgedParts = new Set<string>();
    for (const request of run.judged.subflow) {
      const section = sectionOf(request);
      expect(section?.supplementary).toContain("The instructions are the only authority");
      expect(section?.asked).toHaveLength(1);
      expect(section?.notAsked).toEqual([NOT_ASKED]);
      judgedParts.add(section!.asked[0]!.part);
    }
    expect([...judgedParts].sort()).toEqual(["p1", "p2"]);
    expect(run.judged.whole).toHaveLength(2);
    for (const request of run.judged.whole) {
      expect(sectionOf(request)).toMatchObject({ asked: [{ part: "p1", words: "Create a deterministic" }, { part: "p2", words: "Start to End Flow." }], notAsked: [NOT_ASKED] });
      expect(JSON.stringify(request.context.instructions)).toContain(TASK);
    }
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
