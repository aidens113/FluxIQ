// A one-part project build through the actual service makes one brief (t679;
// cost-gap design (5)): a scripted model plays the supervisor and the builder
// on a stub domain, a community garden's plot board, where a Flow's "Book"
// puts a plot on the person's bookings; one plot was booked before the build.
// The plan is one subflow the router runs, so the builder's own test is the
// judged whole run of the Flow assembled from its proposal: its judge is the
// whole-Flow judge, a pair per tested revision, and no subflow-scoped judge is
// asked. The test's booking is a lasting act, recorded under the supervisor,
// and nothing sends a reset brief. The supervisor writes the plan, dispatches
// and completes on the yes the dispatch answer carries: three decisions. The
// Flow is proposed through the candidate's promotion, from the whole trial's
// record. Builders hold a lease of a host of capacity 1, and the whole test
// runs inside it.
//
// Nothing here waits on the wall clock (`./project-build-reset.test.ts`, t644):
// the reset's settled read is held at zero, and the watchdog is a hang guard.

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../../../host-runtime.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import type { AutomationStudioHostResourceAcquireResult, AutomationStudioHostResourceHolder, AutomationStudioHostResourcePort } from "../../../project-agents/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioTestDeclaredStepResolution } from "./declared-step-resolution.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds.ts";

// The reset's settled read, its two reads back to back (header).
vi.mock("../../../flow-bootstrap/site-reset/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS: 0 }));
// A hang guard only (header).
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

/** The fixture instruction's words (`blankFixture`): the one part is all of them. */
const TASK = "Create a deterministic Start to End Flow.";
/** The plot board's own Book node, which a Flow's run presses (header). */
const BOOK = "domain.isolated.book-plot";
/** The plot the Flow books; one other was booked before the build. */
const PLOT = "plot:east-4";
const BOOKED_BEFORE = "plot:east-1";

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

const PLAN = {
  taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The plot is booked"], lastingActs: ["create_new"] }], notAsked: [] },
  subflows: [{ key: "book_plot", name: "Book plot", parts: ["p1"] }]
};
const BRIEF = { kind: "build", subflowKey: "book_plot", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, permittedActs: ["create_new"] };
/** The builder's subflow: its part asks a lasting act, so its one step declares it, as a real script must (t597). */
const SUBMISSION = { flow: ["flow: Book plot", "step book: book the plot", `  node: ${BOOK}`, `  plot: ${PLOT}`, "  consequences: create_new"].join("\n") };

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

async function plotBuild() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-single-"));
  const bookings = new Set([BOOKED_BEFORE]);
  const booked: string[] = [];
  const judged = { whole: [] as AutomationStudioLlmTaskRequest[], scoped: [] as AutomationStudioLlmTaskRequest[] };
  /** The supervisor's own tool calls and completions, in order. */
  const supervisorDid: string[] = [];
  /** The builders' briefs, by the brief id each builder was asked under. */
  const builderTests: JsonObject[] = [];
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") {
      // A subflow-scoped judge is told the trial ran a subflow of a larger Flow (`../subflow-trials.ts`).
      (JSON.stringify(request.context).includes("of a larger Flow") ? judged.scoped : judged.whole).push(request);
      return judgeReply("yes");
    }
    const loop = request.context.evidenceLoop;
    const evidence = (loop?.evidence ?? []) as Entry[];
    const tools = (loop?.tools ?? []).map((tool) => tool.toolId);
    // The instruction's own read: no answer, so nothing it asks for is read as lasting or not.
    if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      const decided = supervisorDecisions === 1
        ? { kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN }
        : supervisorDecisions === 2
          ? { kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the one subflow.", briefs: [BRIEF] } }
          : { kind: "complete", result: (lastOf(evidence, "project.dispatch")?.complete as JsonObject | undefined) ?? {} };
      supervisorDid.push(decided.kind === "complete" ? "complete" : String(decided.toolId));
      return decision(decided);
    }
    const properties = (loop!.completionSchema.properties ?? {}) as JsonObject;
    const subflowKey = (properties.subflowKey as JsonObject | undefined)?.const as string;
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: SUBMISSION });
    if (tested?.verdict !== "yes") {
      if (tested) builderTests.push(tested);
      return decision({ kind: "tool_call", callId: `test.${builderTests.length + 1}`, toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } });
    }
    builderTests.push(tested);
    return decision({ kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } });
  });
  const host = new CountingHost(1);
  const serviceOptions: AutomationStudioServiceOptions = {
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: {
      domainId: "isolated", deniedEvidenceKeys: [], resolvePlanNodeParameters: automationStudioTestDeclaredStepResolution,
      tools: [{ toolId: "inspect", description: "Inspect", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { bookings: [...bookings] }, effectApplied: false, targetsUnchanged: true })
    } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>,
    hostRuntime: { ...bookingDiffs(bookings), hostResources: host }
  };
  const service = new AutomationStudioService(serviceOptions);
  service.bindNativeNodeRuntime(plotRuntime(bookings, booked));
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service, "active", "isolated");
  const proposed = vi.spyOn(service, "createFlowBootstrapAdaptation");
  return {
    bookings, booked, judged, supervisorDid, builderTests, host, proposed,
    build: () => builds.track(project.id, flow.flowId, service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project" }))
  };
}

describe("a one-part project build", () => {
  it("makes one builder brief whose test is the judged whole run, no reset brief, and three supervisor decisions, and proposes the Flow", async () => {
    const run = await plotBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    // write_plan, dispatch, complete: no assembly, no reset brief, no second test.
    expect(run.supervisorDid).toEqual(["project.write_plan", "project.dispatch", "complete"]);
    // One builder, holding the one lease, and the whole test ran inside it.
    expect(run.host.holders).toHaveLength(1);
    expect(run.host.most).toBe(1);
    expect(run.host.held).toBe(0);
    // No subflow-scoped judge; the whole-Flow judge once, its first answer and its confirmation.
    expect(run.judged.scoped).toHaveLength(0);
    expect(run.judged.whole).toHaveLength(2);
    // The builder's test answered as the judged whole run, with the complete object the supervisor completed with.
    expect(run.builderTests).toHaveLength(1);
    expect(run.builderTests[0]).toMatchObject({ verdict: "yes", partial: true, feedback: { wholeTest: { verdict: "yes" }, complete: { revision: 1 } } });
    // The Flow's booking is the build's lasting act; the plot booked before the build is untouched.
    expect(run.booked).toEqual([`run Book ${PLOT}`]);
    expect([...run.bookings]).toEqual([BOOKED_BEFORE, PLOT]);
    // Proposed through the candidate's promotion, standing on the whole trial.
    expect(run.proposed).toHaveBeenCalledTimes(1);
    expect(result.candidate).toMatchObject({ trial: { verdict: "yes" } });
  });
});

function plotNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"]): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label} on the plot board.`, category: "action",
    source: { kind: "importer", domainId: "isolated", packageId: "isolated.plots", implementationKey: id },
    availability: { kind: "domain", domainId: "isolated" }, requiredRuntimeCapabilities: ["isolated.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters,
    outputAction: { fixedOutputId: id }
  };
}

/** The plot board's Book, as a Flow's run presses it: it puts its plot on the bookings (header). */
function plotRuntime(bookings: Set<string>, booked: string[]) {
  const nodes = [plotNode(BOOK, "Book plot", [{ id: "plot", label: "Plot", valueType: "string", required: true }])];
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["isolated.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "isolated.plots", packageVersion: "1.0.0", domainId: "isolated", nodes },
    { packageId: "isolated.plots", packageVersion: "1.0.0", implementations: { [BOOK]: ({ parameters }: { parameters: Readonly<Record<string, unknown>> }) => {
      bookings.add(String(parameters.plot));
      booked.push(`run Book ${String(parameters.plot)}`);
      return { status: "success" as const, route: "success", outputs: { success: true } };
    } } }
  );
}

/** The plot board's host runtime: a snapshot of the bookings around each step a run takes, and the diff of the two. */
function bookingDiffs(bookings: Set<string>): AutomationStudioHostRuntimeBoundary {
  let captured = 0;
  const shown = (ref: AutomationStudioHostStateSnapshotRef | undefined) => (Array.isArray(ref?.summary?.bookings) ? ref.summary.bookings : []) as string[];
  return {
    capabilities: [],
    captureStateSnapshot: ({ attemptId, point }) => {
      captured += 1;
      return { stateSnapshotId: `bookings.${captured}`, stateRef: `bookings.${captured}@${attemptId}:${point}`, capturedAt: captured, summary: { bookings: [...bookings] } };
    },
    inspectStateDiff: ({ before, after }) => {
      const was = shown(before);
      const now = shown(after);
      return { documentChanged: false, added: now.filter((item) => !was.includes(item)).join("\n"), removed: was.filter((item) => !now.includes(item)).join("\n"), items: { before: was, after: now } };
    }
  };
}
