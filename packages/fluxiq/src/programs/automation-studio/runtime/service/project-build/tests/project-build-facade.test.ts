// @fluxiq-test-group real-sql
// A project build through the actual service (unit A5c): a scripted model
// plays the supervisor -- plan, dispatch, assemble, test, complete -- and each
// builder -- submit its subflow, test it, complete -- while the service's real
// dispatcher, subflow trials, whole-candidate trial and build-test judges run
// over the mock provider. A judged yes on the whole candidate proposes it
// through the candidate's own promotion; a no keeps it as a draft. Builders
// are scheduled on a stub host at capacity 2 (two independent subflows built
// at once) and capacity 1 (one at a time).
//
// **Nothing here waits on the wall clock (t644).** Under load these builds
// took up to 60 s against 1-3 s quiet and failed on the 60 s watchdog, and the
// timed-out build, still writing, then failed the directory's removal (t616).
// The build's own bounds (the supervisor's 30 minutes, the builders' loops,
// each provider call's deadline against a provider that answers at once) are
// never reached here, so the watchdog is a hang guard only, and cleanup stops
// any build still running and waits for it before removing its directory
// (`./settled-builds.ts`).
//
// **A one-part plan's builder test is the judged whole run (t679).** Its
// supervisor writes the plan, dispatches and completes on the yes the
// dispatch answer carries; no subflow-scoped judge is asked. What only a plan
// of several subflows still has -- the scoped judge and a builder's proposed
// success check it is judged against -- is tested on two parts.

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { automationStudioActivityHub } from "../../../activity/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioHostResourceAcquireResult, AutomationStudioHostResourceHolder, AutomationStudioHostResourcePort } from "../../../project-agents/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds.ts";

// A hang guard only (header).
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

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

/** A part's proposed success check, in the script's own terms: one that names no handle (t679). */
const PART_DONE_WHEN = "done when: dialog alert \"Not saved\" absent";

/** What a builder submits: for the router-run subflow a plan of a start and an end; for a part, the script of one short wait, with `doneWhen` its proposed check. */
function submission(subflowKey: string, proposedCheck?: JsonObject[], doneWhen?: string): JsonObject {
  if (subflowKey !== "main") return { flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, ...(doneWhen ? [`  ${doneWhen}`] : []), "  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds", "end"].join("\n") };
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

/**
 * The supervisor's script in place of plan, dispatch, assemble, test (t590).
 * `amend`: the second part runs after the first; the first is built, the plan
 * amended with only what nobody asked for changed, and the second then sent.
 * `ends`: the one builder never submits, so its brief comes back short, and
 * the supervisor ends honestly.
 */
type Script = "amend" | "ends";
const ENDED_REASON = "The control the task names is not on the start page.\nNo other way to it was found.";

function scripted(script: Script, decisionNumber: number, evidence: readonly Entry[]): ReturnType<typeof decision> | undefined {
  const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
  const after = planInput("two_parts");
  const subflows = (after.subflows as JsonObject[]).map((subflow) => (subflow.key === "second" ? { ...subflow, after: ["first"] } : subflow));
  const brief = (subflowKey: string, parts: string[], predecessors: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors }, allowanceUsd: 0.01, maxIterations: 6 });
  if (script === "ends") {
    if (decisionNumber === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: planInput("one_part") });
    if (decisionNumber === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build the subflow.", briefs: [brief("main", ["p1"], [])] } });
    return decision({ kind: "complete", result: { ended: "blocked", reason: ENDED_REASON } });
  }
  switch (decisionNumber) {
    case 1: return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: { ...after, subflows } });
    case 2: return decision({ kind: "tool_call", callId: "dispatch-first", toolId: "project.dispatch", input: { reason: "Build the first part.", briefs: [brief("first", ["p1"], [])] } });
    case 3: return decision({ kind: "tool_call", callId: "amend", toolId: "project.amend_plan", input: { taskSpec: { ...(after.taskSpec as JsonObject), notAsked: [NOT_ASKED, "Running it twice"] }, subflows, reason: "Name one more thing nobody asked for." } });
    case 4: return decision({ kind: "tool_call", callId: "dispatch-second", toolId: "project.dispatch", input: { reason: "Build the second part after the first.", briefs: [brief("second", ["p2"], ["first"])] } });
    case 5: return decision({ kind: "tool_call", callId: "assemble", toolId: "project.assemble", input: {} });
    case 6: return decision({ kind: "tool_call", callId: "test", toolId: "core.test_candidate", input: assembled ?? {} });
    default: return decision({ kind: "complete", result: assembled ?? {} });
  }
}

async function projectBuild(options: { shape?: Shape; whole?: "yes" | "no"; capacity?: number; domainText?: string; proposedCheck?: JsonObject[]; doneWhen?: string; script?: Script } = {}) {
  const shape = options.shape ?? "one_part";
  /** Every tool answer the supervisor was shown, by tool, and what each builder's every decision was asked with, by subflow. */
  const supervisorSaw = new Map<string, JsonObject>();
  const builderSaw = new Map<string, string[]>();
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
      const answer = scoped ? "yes" : options.whole ?? "yes";
      const reply = judgeReply(answer);
      // This Start-to-End fixture has no measured task defect. An intentional
      // negative supplies an empty account and remains unconfirmed, not no.
      return answer === "no" ? { ...reply, response: { ...reply.response, diagnosis: { ...reply.response.diagnosis, defects: [] } } } : reply;
    }
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    const tools = loop.tools.map((tool) => tool.toolId);
    offered.push(tools);
    instructed.push({ supervisor: tools.includes("project.write_plan"), instructions: request.domainInstructions });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      for (const entry of evidence) supervisorSaw.set(entry.toolId, entry.value as JsonObject);
      const own = options.script ? scripted(options.script, supervisorDecisions, evidence) : undefined;
      if (own) return own;
      const assembled = lastOf(evidence, "project.assemble")?.complete as JsonObject | undefined;
      // One part: its builder's test was the judged whole run, so it completes on the dispatch answer's yes (t679).
      if (shape === "one_part" && supervisorDecisions >= 3) {
        const complete = lastOf(evidence, "project.dispatch")?.complete as JsonObject | undefined;
        return decision({ kind: "complete", result: complete ?? { ended: "partial", reason: options.whole === "no" ? "The whole Flow's trial could not be confirmed." : "The whole Flow's trial was judged not to do what was asked." } });
      }
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
    builderSaw.set(subflowKey, [...(builderSaw.get(subflowKey) ?? []), JSON.stringify(request.context)]);
    if (options.script === "ends") return decision({ kind: "tool_call", callId: `look-${evidence.length}`, toolId: "inspect", input: { at: evidence.length } });
    const submitted = lastOf(evidence, "core.submit_subflow");
    const tested = lastOf(evidence, "core.test_subflow");
    if (submitted?.ok !== true) return decision({ kind: "tool_call", callId: `submit-${subflowKey}`, toolId: "core.submit_subflow", input: submission(subflowKey, options.proposedCheck, options.doneWhen) });
    if (options.whole === "no" && tested?.verdict === "unsure") return decision({ kind: "complete", result: { ended: "partial", reason: "The whole Flow's trial could not be confirmed." } });
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
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service);
  const proposed = vi.spyOn(service, "createFlowBootstrapAdaptation");
  return {
    service, projectId: project.id, flowId: flow.flowId, judged, offered, instructed, host, proposed, supervisorSaw, builderSaw,
    build: (extra: { mode?: "extend" } = {}) => builds.track(project.id, flow.flowId, service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", ...extra }))
  };
}

describe("a project build through the actual service", () => {
  it("plans a one-part task, whose builder's test is the judged whole run, and proposes the whole Flow on that yes", async () => {
    const run = await projectBuild();
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(result.candidate).toMatchObject({ trial: { verdict: "yes" } });
    expect(run.proposed).toHaveBeenCalledTimes(1);
    // No subflow-scoped judge: the builder's test was the whole trial, a first answer and its confirmation, judged on the whole task.
    expect(run.judged.subflow).toHaveLength(0);
    expect(run.judged.whole).toHaveLength(2);
    for (const request of run.judged.whole) expect(JSON.stringify(request.context)).toContain(TASK);
    // Write the plan, dispatch, complete: the dispatch answer carried the complete object.
    expect(run.supervisorSaw.get("project.dispatch")).toMatchObject({ ok: true, complete: { revision: 1 }, returns: [{ outcome: "done" }] });
    expect(run.supervisorSaw.has("project.assemble")).toBe(false);
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
    const first = [...run.builderSaw.values()][0]![0]!;
    expect(first).toContain("Declare the lasting consequences of every recovery press");
    expect(first).toContain("Truly nonlasting actions keep an empty declaration");
  });

  // The plan the supervisor writes gives no success check, so the builder's own is its subflow's, and its trial is judged against it (t569).
  // A one-part plan's test is the whole run (t679), so the scoped judge this checks is a plan of several subflows'.
  it("judges a subflow's trial against the success check its builder proposed when the plan gives none", async () => {
    const run = await projectBuild({ shape: "two_parts", doneWhen: PART_DONE_WHEN });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    expect(run.judged.subflow.length).toBeGreaterThan(0);
    for (const request of run.judged.subflow) expect(JSON.stringify(request.context)).toContain("Its success check, as its builder proposed it (the plan gives none): ");
  });

  it("keeps the assembled Flow as a draft when a negative names no measured defect, and proposes nothing", async () => {
    const run = await projectBuild({ whole: "no" });
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const result = await run.build().finally(unsubscribe);
    expect(result).toMatchObject({ status: "draft", verification: "not_performed", promotionAllowed: false, trial: { verdict: "unsure" } });
    // The supervisor ended on a draft: its row says Core's record of the tests beside its checked reason (t738, `../../project-build-ending/`).
    const told = seen.find((event) => event.detail?.title === "FluxIQ stopped with the Flow only partly built.");
    expect((told?.detail as { text?: string } | undefined)?.text).toBe("The whole Flow's trial could not be confirmed. The one part tested on its own did not pass its own test: it was tested once, and its last test could not be confirmed. The judged test run of the whole Flow from its start ran both of its steps and stored no rows, and could not be confirmed to do what was asked. The build left no change on the site that it knows of.");
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

  // `project.amend_plan` used to drop every proposal made before it, so a dependent could not be sent, prepared or assembled (t588 open question 1, t590).
  it("keeps the proposal of a subflow an amendment left as it was, and its dependent is then sent and has its entry prepared from it", async () => {
    const run = await projectBuild({ shape: "two_parts", script: "amend" });
    // Each entry preparation's session, as the service writes it (`../entry-preparation.ts`).
    const entries: string[] = [];
    const service = run.service as unknown as { writeRuntimeSession(projectId: string, session: { status: string; metadata?: JsonObject }, ...rest: unknown[]): Promise<unknown> };
    const write = service.writeRuntimeSession.bind(service);
    vi.spyOn(service, "writeRuntimeSession").mockImplementation(async (projectId, session, ...rest) => {
      const entry = session.metadata?.entryPreparation as JsonObject | undefined;
      if (entry) entries.push(`${String(entry.subflowKey)} after ${JSON.stringify((entry.predecessors as JsonObject[]).map((ref) => ref.subflowKey))} ${session.status}`);
      return await write(projectId, session, ...rest);
    });
    await run.build().then(() => undefined, () => undefined);
    expect(run.supervisorSaw.get("project.amend_plan")).toMatchObject({ ok: true, written: "plan_revision", proposalsKept: [{ subflowKey: "first", briefId: "brief-1" }], proposalsDropped: [] });
    expect(run.supervisorSaw.get("project.dispatch")).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", subflowKey: "second" }] });
    // The second builder's entry ran the first part's kept proposal once, to its end, before its first look.
    expect(entries.at(-1)).toBe("second after [\"first\"] succeeded");
  });

  // The dependent's subflow trial runs the kept predecessor (`keptUnder`, `../subflow-trials.ts`, `../../subflow-trial/run.ts`), so it comes back done and is assembled.
  it("assembles the kept proposal with its dependent once the dependent's subflow trial runs a kept predecessor", async () => {
    const run = await projectBuild({ shape: "two_parts", script: "amend" });
    // Each subflow trial's session, as the service writes it (`../../subflow-trial/run.ts`).
    const trials: string[] = [];
    const service = run.service as unknown as { writeRuntimeSession(projectId: string, session: { status: string; metadata?: JsonObject }, ...rest: unknown[]): Promise<unknown> };
    const write = service.writeRuntimeSession.bind(service);
    vi.spyOn(service, "writeRuntimeSession").mockImplementation(async (projectId, session, ...rest) => {
      const trial = session.metadata?.subflowTrial as JsonObject | undefined;
      if (trial && session.status !== "queued" && session.status !== "running") trials.push(`${String(trial.subflowKey)} ${session.status}`);
      return await write(projectId, session, ...rest);
    });
    const result = await run.build();
    if (result.status !== "proposed") throw new Error(`expected a proposal, got ${JSON.stringify(result)}`);
    // The dependent's trial ran: its entry, the kept proposal of "first", was prepared, and the trial answered yes.
    expect([...new Set(trials)]).toEqual(["first succeeded", "second succeeded"]);
    const tested = run.builderSaw.get("second")!.at(-1)!;
    expect(tested).toContain("\"entryPrepared\":true");
    expect(tested).not.toContain("subflow.trial_predecessor_stale");
    expect(run.supervisorSaw.get("project.dispatch")).toMatchObject({ ok: true, returns: [{ briefId: "brief-2", subflowKey: "second", outcome: "done" }] });
    expect(run.supervisorSaw.get("project.assemble")).toMatchObject({ ok: true, assembledFrom: [{ subflowKey: "first", briefId: "brief-1" }, { subflowKey: "second", briefId: "brief-2" }], calls: { inOrder: ["first", "second"] } });
  });

  // A failed build's chat message was made from the thrown error, never from the ending the supervisor recorded (t586 open question 1, t590).
  // Its row said that it ended and never why (t649, A8 frozen pair 3 `run-mv9zn5ob-d929084d`, 00048): the reason is said, screened, before what is left.
  it("keeps its own failure code when it fails, and tells the person the recorded ending's kind, why, and what is left", async () => {
    const run = await projectBuild({ script: "ends" });
    const seen: ClientGatewayActivity[] = [];
    const unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
    const failure = await run.build().then(() => undefined, (error: unknown) => error).finally(unsubscribe);
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(failure);
    // The code every debug and the Lab read is the build's own, as before t590.
    // Beside it, that the ending row told the ending, so the chat's answer does not say it again (t753).
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.post_provider_validation_failed", issueCodes: ["project.build_blocked", "project.build_ending_told"] });
    expect(diagnostic!.ending).toBeUndefined();
    const told = seen.find((event) => event.detail?.title === "FluxIQ could not finish the Flow.");
    // The row is the one account of the ending (t753): why, then what is left; the chat's answer says neither again.
    expect(told?.detail).toMatchObject({ kind: "note", status: "failed", text: "The control the task names is not on the start page. No other way to it was found. The build left no change on the site that it knows of." });
    // The failure carries why beside the supervisor's ending, so the chat's ending and the build's last row say it (t649).
    expect(diagnostic!.endedBecause).toBe("The control the task names is not on the start page. No other way to it was found.");
  });

  it("refuses a project build that would extend the Flow, before any model call", async () => {
    const run = await projectBuild();
    await expect(run.build({ mode: "extend" })).rejects.toThrow();
    expect(run.offered).toEqual([]);
    expect(run.proposed).not.toHaveBeenCalled();
  });
});
