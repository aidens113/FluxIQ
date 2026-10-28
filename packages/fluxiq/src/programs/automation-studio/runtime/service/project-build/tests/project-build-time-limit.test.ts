// @fluxiq-test-group real-sql
// A project build its time limit stops, through the actual service (t601).
// Everything-store `run-mv8id5vg` reached its time limit and the person read
// "The supervisor ended the build: it could not finish the Flow", though the
// limit ended it and its part had been tested many times. Here the limit is
// shortened, a scripted builder tries its subflow and ends partial on a trial
// that could not be confirmed, the scripted supervisor then waits out the
// clock, and the person is told the time limit, what was tested and what is
// left, in Core's words.
//
// **The bound runs on a clock the test holds (t615, t616).** On the real clock
// both tests failed under load (a vitest run over project-agents,
// service/project-build and flow-bootstrap/subflow-candidate together): the work
// deadline fired while the builder was still trying its subflow, so the part
// read "never tested" or the assembled candidate was never tested whole. The
// build passes the supervisor's clock through (`../run.ts`,
// `project-agents/supervisor/supervisor-loop.ts`); the test hands its own clock in place of
// the real one, so the deadline is reached only when the scripted supervisor is
// waiting on the decision that outlives the bound. Every other timer stays on
// the real clock.
//
// **What a part's own test means depends on the plan (t679).** On a plan of one
// subflow the builder's test is the judged whole run of the Flow assembled
// from its proposal, so a build its time limit stops after that test holds an
// assembled candidate, kept as a draft, and the words count that test as its
// part's. A part passing its own test while the whole Flow fails, or a build
// stopped before anything was assembled, needs a plan of several subflows, and
// those cases are built on two parts.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";

// The build's bound, shortened: its work stops 6 seconds after the supervisor starts, on the test's clock.
vi.mock("../../../loop-limits/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS: 8_000, AUTOMATION_STUDIO_PROJECT_BUILD_ENDING_MS: 2_000 }));
// The clock the build passes to its supervisor, held by the test (header).
const buildClock = vi.hoisted(() => heldClock());
vi.mock("../../../project-agents/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_PROJECT_SUPERVISOR_REAL_CLOCK: buildClock.clock }));

// A hang guard only: loaded runs took up to 61 s against 1.5 s quiet, past the 60 s it was (t616).
vi.setConfig({ testTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The supervisor's time-limit timers, on the test's clock (header); `reachWorkDeadline` moves the clock to the bound less its ending. */
type BuildClock = { held: () => readonly number[]; reachWorkDeadline: () => void };
let clock: BuildClock;
beforeEach(() => { clock = buildClock.start(); });

const TASK = "Create a deterministic Start to End Flow.";
const PLAN = {
  taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
  subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
};
const BRIEF = { kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 };
/** Two parts the router-run subflow Core adds calls in turn: a plan whose parts are tested on their own (header). */
const TWO_PARTS = {
  taskSpec: {
    parts: [
      { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: [] },
      { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }
    ],
    notAsked: []
  },
  subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"] }]
};
const TWO_BRIEFS = (["first", "second"] as const).map((subflowKey, index) => ({ kind: "build", subflowKey, parts: [`p${index + 1}`], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 }));
/** What a builder submits: the router-run subflow's plan, or a part's script of one short wait. */
const submissionOf = (subflowKey: string): JsonObject => (subflowKey === "main" ? SUBMISSION : { flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, "  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds", "end"].join("\n") });
/** The subflow a builder's completion names, from its schema. */
const subflowOf = (loop: { completionSchema: JsonObject }): string => (((loop.completionSchema.properties as JsonObject | undefined)?.subflowKey as JsonObject | undefined)?.const as string);
const SUBMISSION = {
  summary: "Build the main subflow",
  plan: {
    schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{
      key: "main", name: "Main", role: "primary",
      nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
      edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
    }]
  }
};
const MODEL_REASON = "The trial could not be confirmed, so this brief ends partial.";

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

/** A decision that never comes inside the build's bound: while it is pending the clock reaches the work deadline, and the call is abandoned. */
function outlivingTheBound(): Promise<never> {
  setImmediate(() => clock.reachWorkDeadline());
  return new Promise((_, reject) => { setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 20_000).unref(); });
}

/**
 * The clock the build hands its supervisor (header): a timer set on it fires only when the test moves the clock past
 * its delay. `start` begins a fresh one for each test. Hoisted with the mock that installs it, so it takes no imports.
 */
function heldClock() {
  type Timer = { delay: number; fire: () => void; cleared: boolean; fired: boolean };
  let held: Timer[] = [];
  const clock = {
    setTimeout: (fire: () => void, ms: number): unknown => {
      const timer: Timer = { delay: ms, fire, cleared: false, fired: false };
      held.push(timer);
      return timer;
    },
    clearTimeout: (handle: unknown): void => {
      const timer = held.find((each) => each === handle);
      if (timer) timer.cleared = true;
    }
  };
  const start = (): BuildClock => {
    held = [];
    return {
      held: () => held.map((timer) => timer.delay),
      reachWorkDeadline: () => {
        // The earliest held deadline is the work deadline, the bound less its ending; the bound itself stays ahead.
        const pending = held.filter((timer) => !timer.cleared && !timer.fired);
        const at = Math.min(...pending.map((timer) => timer.delay));
        for (const timer of pending.filter((due) => due.delay <= at)) {
          timer.fired = true;
          timer.fire();
        }
      }
    };
  };
  return { clock, start };
}

describe("a project build its time limit stops", () => {
  it("says the time limit, what was tested and what is left, never that the supervisor ended it", async () => {
    let supervisorDecisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") return judgeReply("unknown");
      const loop = request.context.evidenceLoop!;
      const evidence = loop.evidence as Entry[];
      if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
        supervisorDecisions += 1;
        if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: TWO_PARTS });
        if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflows.", briefs: TWO_BRIEFS } });
        // The supervisor is still deciding when its time runs out.
        return await outlivingTheBound();
      }
      const submitted = lastOf(evidence, "core.submit_subflow");
      if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: submissionOf(subflowOf(loop)) });
      if (!lastOf(evidence, "core.test_subflow")) return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
      return decision({ kind: "complete", result: { ended: "partial", reason: MODEL_REASON } });
    });
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-time-limit-"));
    const service = new AutomationStudioService({
      dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
      llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) }
    });
    cleanups.push(async () => {
      await service.close();
      await rm(dataDir, { recursive: true, force: true });
    });
    const { project, flow } = await blankFixture(service);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" })
      .then(() => undefined, (error: unknown) => error).finally(unsubscribe);
    // The bound reached the build through its clock: the work deadline 2 seconds before the 8-second bound.
    expect(clock.held()).toEqual([6_000, 8_000]);
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    // The code every debug and the Lab read stays the build's own.
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_time_limit", "project.build_blocked", "project.build_ending_told"] });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({
      kind: "note", status: "failed",
      text: TEST_ONE_TEXT
    });
    expect(seen.some((event) => event.detail?.title === "FluxIQ could not finish the Flow.")).toBe(false);
    // The time limit's row is Core's words alone; the brief's own return row may quote its builder.
    expect(JSON.stringify(told)).not.toContain(MODEL_REASON);
  });

  // t608 (everything-store `run-mv8p0p7c`): the limit stopped a build holding an assembled candidate, which was kept as a
  // draft, and the person was told only that its whole test was judged no. The kept draft says the time limit too.
  it("keeps an assembled candidate as a draft and says the time limit, what was tested and the last whole test", async () => {
    let supervisorDecisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") {
        const scoped = JSON.stringify(request.context).includes("This trial ran only the subflow");
        const reply = judgeReply(scoped ? "yes" : "no");
        // The start/wait/end fixture exposes no measurable whole-task defect.
        // Its negative is usable but unsupported, so the trial stays unsure.
        return scoped ? reply : { ...reply, response: { ...reply.response, diagnosis: { ...reply.response.diagnosis, defects: [] } } };
      }
      const loop = request.context.evidenceLoop!;
      const evidence = loop.evidence as Entry[];
      if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
        supervisorDecisions += 1;
        if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: TWO_PARTS });
        if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflows.", briefs: TWO_BRIEFS } });
        if (supervisorDecisions === 3) return decision({ kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} });
        const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
        if (supervisorDecisions === 4) return decision({ kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: assembled ?? {} });
        // The whole test remains unconfirmed when the supervisor's time runs out.
        return await outlivingTheBound();
      }
      const submitted = lastOf(evidence, "core.submit_subflow");
      if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: submissionOf(subflowOf(loop)) });
      if (lastOf(evidence, "core.test_subflow")?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
      return decision({ kind: "complete", result: { subflowKey: subflowOf(loop), revision: submitted.revision as number, digest: submitted.digest as string } });
    });
    const { service, projectId, flowId } = await serviceWith(provider);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const result = await service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }).finally(unsubscribe);
    expect(clock.held()).toEqual([6_000, 8_000]);
    // The draft's trial keeps its own code first, which every debug and the Lab read, and carries the time limit beside it,
    // which the chat's reply opens with (`conversations/commands/create-here.ts`).
    expect(result).toMatchObject({ status: "draft", promotionAllowed: false, trial: { verdict: "unsure", codes: ["candidate.trial_unconfirmed", "project.build_time_limit", "project.build_ending_told"] } });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({
      kind: "note", status: "failed",
      text: TEST_TWO_TEXT
    });
  });

  // t679: one part's builder test is the judged whole run, so its time limit finds a Flow assembled and tested, and says the part was tested.
  it("keeps a one-part build's whole test as a draft, and counts its builder's test as its part's", async () => {
    let supervisorDecisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") return judgeReply("unknown");
      const loop = request.context.evidenceLoop!;
      const evidence = loop.evidence as Entry[];
      if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
        supervisorDecisions += 1;
        if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN });
        if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [BRIEF] } });
        // The supervisor is still deciding when its time runs out.
        return await outlivingTheBound();
      }
      const submitted = lastOf(evidence, "core.submit_subflow");
      if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
      if (!lastOf(evidence, "core.test_subflow")) return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
      return decision({ kind: "complete", result: { ended: "partial", reason: MODEL_REASON } });
    });
    const { service, projectId, flowId } = await serviceWith(provider);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const result = await service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }).finally(unsubscribe);
    expect(clock.held()).toEqual([6_000, 8_000]);
    expect(result).toMatchObject({ status: "draft", promotionAllowed: false });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({ kind: "note", status: "failed", text: TEST_THREE_TEXT });
    // Its part was tested, by the builder's whole test: never said to be untested.
    expect(JSON.stringify(told)).not.toContain("never tested");
  });
});

/** What each case's time limit tells the person (header). */
const TEST_ONE_TEXT = "None of its 2 parts passed its own test. Left: a part tested once whose last test could not be confirmed; and a part tested once whose last test could not be confirmed. The whole Flow was not assembled, so it was never tested as one. The build left no change on the site that it knows of.";
const TEST_TWO_TEXT = "Of its 2 parts, 2 passed their own test. A whole Flow was assembled and tested from its start, and its last whole test could not be confirmed; it is kept as a draft, and nothing was put into the Flow. The build left no change on the site that it knows of.";
const TEST_THREE_TEXT = "Its one part did not pass its own test. Left: a part tested once whose last test could not be confirmed. A whole Flow was assembled and tested from its start, and its last whole test could not be confirmed; it is kept as a draft, and nothing was put into the Flow. The build left no change on the site that it knows of.";

/** The service over `provider`, with a blank project and Flow to build. */
async function serviceWith(provider: ReturnType<typeof mockProvider>) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-time-limit-"));
  const service = new AutomationStudioService({
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 60, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }) }
  });
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { project, flow } = await blankFixture(service);
  return { service, projectId: project.id, flowId: flow.flowId };
}
