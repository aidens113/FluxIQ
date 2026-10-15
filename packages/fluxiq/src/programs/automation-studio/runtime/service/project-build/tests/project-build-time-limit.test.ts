// A project build its time limit stops, through the actual service (t601).
// Everything-store `run-mv8id5vg` reached its time limit and the person read
// "The supervisor ended the build: it could not finish the Flow", though the
// limit ended it and its part had been tested many times. Here the limit is
// shortened, a scripted builder tries its subflow and ends partial on a trial
// that could not be confirmed, the scripted supervisor then waits out the
// clock, and the person is told the time limit, what was tested and what is
// left, in Core's words.
//
// **The bound runs on a clock the test holds (t615).** On the real clock both
// tests failed under load (a vitest run over project-agents, service/project-build
// and flow-bootstrap/subflow-candidate together): the work deadline fired while
// the builder was still trying its subflow, so the part read "never tested" or
// the assembled candidate was never tested whole. The supervisor's two time
// signals (`startClock` in `project-agents/supervisor/supervisor-loop.ts`) are
// now held by the test and reach their deadline only when the scripted
// supervisor is waiting on the decision that outlives the bound; every other
// timer stays on the real clock.

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

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The supervisor's time-limit timers, held off the real clock (header); `reachWorkDeadline` moves the clock to the bound less its ending. */
type BuildClock = { held: () => readonly number[]; reachWorkDeadline: () => void };
let clock: BuildClock;
beforeEach(() => { clock = holdTheBuildClock(); });

const TASK = "Create a deterministic Start to End Flow.";
const PLAN = {
  taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
  subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
};
const BRIEF = { kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 6 };
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
 * Holds the timers the supervisor's `startClock` sets (header), recognised by their caller, and lets every other
 * timer through to the real clock. A held timer fires only when the test moves the clock past its delay.
 */
function holdTheBuildClock(): BuildClock {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const held: { delay: number; fire: () => void; cleared: boolean; fired: boolean }[] = [];
  const handles = new Map<unknown, (typeof held)[number]>();
  const set = vi.spyOn(globalThis, "setTimeout").mockImplementation(((handler: () => void, delay?: number, ...rest: unknown[]) => {
    if (!new Error().stack?.includes("startClock")) return (realSet as (...args: unknown[]) => unknown)(handler, delay, ...rest);
    const timer = { delay: delay ?? 0, fire: () => handler(), cleared: false, fired: false };
    const handle = { held: true };
    held.push(timer);
    handles.set(handle, timer);
    return handle;
  }) as unknown as typeof setTimeout);
  const clear = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((handle: unknown) => {
    const timer = handles.get(handle);
    if (timer) timer.cleared = true;
    else realClear(handle as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout);
  cleanups.push(async () => {
    set.mockRestore();
    clear.mockRestore();
  });
  return {
    held: () => held.map((timer) => timer.delay),
    reachWorkDeadline: () => {
      // The earliest held deadline is the work deadline, the bound less its ending; the bound itself stays ahead.
      const at = Math.min(...held.filter((timer) => !timer.cleared && !timer.fired).map((timer) => timer.delay));
      for (const timer of held.filter((due) => !due.cleared && !due.fired && due.delay <= at)) {
        timer.fired = true;
        timer.fire();
      }
    }
  };
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
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_time_limit", "project.build_blocked"] });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({
      kind: "note", status: "failed",
      text: "Its one part did not pass its own test. Left: a part tested once whose last test could not be confirmed. The whole Flow was not assembled, so it was never tested as one. Nothing this build did is still on the target."
    });
    expect(seen.some((event) => event.detail?.title === "The supervisor ended the build: it could not finish the Flow.")).toBe(false);
    // The time limit's row is Core's words alone; the brief's own return row may quote its builder.
    expect(JSON.stringify(told)).not.toContain(MODEL_REASON);
  });

  // t608 (everything-store `run-mv8p0p7c`): the limit stopped a build holding an assembled candidate, which was kept as a
  // draft, and the person was told only that its whole test was judged no. The kept draft says the time limit too.
  it("keeps an assembled candidate as a draft and says the time limit, what was tested and the last whole test", async () => {
    let supervisorDecisions = 0;
    const provider = mockProvider(async (request) => {
      if (request.taskKind === "loop_verification") return judgeReply(JSON.stringify(request.context).includes("This trial ran only the subflow") ? "yes" : "no");
      const loop = request.context.evidenceLoop!;
      const evidence = loop.evidence as Entry[];
      if (loop.tools.some((tool) => tool.toolId === "project.write_plan")) {
        supervisorDecisions += 1;
        if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN });
        if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [BRIEF] } });
        if (supervisorDecisions === 3) return decision({ kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} });
        const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
        if (supervisorDecisions === 4) return decision({ kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: assembled ?? {} });
        // The whole test was judged no, and the supervisor is still deciding what to change when its time runs out.
        return await outlivingTheBound();
      }
      const submitted = lastOf(evidence, "core.submit_subflow");
      if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
      if (lastOf(evidence, "core.test_subflow")?.verdict !== "yes") return decision({ kind: "tool_call", callId: "test", toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
      return decision({ kind: "complete", result: { subflowKey: "main", revision: submitted.revision as number, digest: submitted.digest as string } });
    });
    const { service, projectId, flowId } = await serviceWith(provider);
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const result = await service.generateFlowBootstrapAdaptation({ projectId, flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }).finally(unsubscribe);
    expect(clock.held()).toEqual([6_000, 8_000]);
    // The draft's trial keeps its own code first, which every debug and the Lab read, and carries the time limit beside it,
    // which the chat's reply opens with (`conversations/commands/create-here.ts`).
    expect(result).toMatchObject({ status: "draft", promotionAllowed: false, trial: { verdict: "no", codes: ["candidate.trial_judged_no", "project.build_time_limit"] } });
    const told = seen.find((event) => event.detail?.title === "The build reached its time limit of 8 seconds before a whole test of the Flow passed.");
    expect(told?.detail, JSON.stringify(seen.map((event) => event.detail?.title).filter(Boolean))).toMatchObject({
      kind: "note", status: "failed",
      text: "Its one part passed its own test. A whole Flow was assembled and tested from its start, and its last whole test was judged not to do what was asked; it is kept as a draft, and nothing was put into the Flow. Nothing this build did is still on the target."
    });
  });
});

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
