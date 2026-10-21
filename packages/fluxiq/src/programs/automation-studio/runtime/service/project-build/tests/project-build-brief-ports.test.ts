// @fluxiq-test-group real-sql
// A brief's surroundings through the actual service (t580, from the A8 bigbox
// debug): a scripted model plays the supervisor and each builder over a stub
// domain.
//
// 1. A dependent builder's entry. Subflow "second" runs after "first". Before
//    the second builder's first look, the first's passing proposal runs once
//    in a session of its own; the second builder then opens with a look where
//    that left the page, not the arrival at the build's start, and its opening
//    says the entry was prepared. The first builder, which has no
//    predecessor, arrives at the start and is told nothing. The second's
//    opening look is sent marked `arrived` (t585), so a domain that counts
//    arrival only from a navigation does not refuse every act on the entry.
//    When the entry's start hook put back an act the first builder left, each
//    ledger marks it undone before the second builder looks, and the opening
//    names it (t585).
// 2. A brief whose parts ask for no lasting act. The person permitted the
//    build to delete and to modify, but this brief permits neither: its press
//    that deletes goes to the person's gate (asked, and declined here), while
//    its press that modifies -- a class nobody is asked about -- runs, and
//    the builder is told the act was outside its brief.
//
// **Only a hang guard is timed (t616).** Under a full sweep "a dependent
// builder's entry > marks the acts ..." failed and passed alone. Loaded runs
// (this directory with conversations/commands, three at once beside ten
// CPU-bound processes) timed out both dependent-entry tests in every copy, at
// 60-64 s against 2 s quiet; the build each runs through the real service waits
// on no clock of its own, and the EBUSY and ENOTEMPTY cleanup failures that
// followed were the timed-out build still writing to the data directory being
// removed (it was released 1-4 s later in each case). The guard is wide so it
// only stops a hang.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration, AutomationStudioActionPermissionCheck } from "../../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AutomationStudioSiteResetLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import type { AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../../parking/index.ts";
import { AutomationStudioService, type AutomationStudioServiceOptions } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioTestDeclaredStepResolution } from "./declared-step-resolution.ts";

vi.setConfig({ testTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TASK = "Create a deterministic Start to End Flow.";
const START_END = {
  nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }],
  edges: [{ key: "start_end", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "end", portId: "in" } }]
};

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

/** Where the supervisor's latest evidence is kept beside the builders'. */
const SUPERVISOR = "(supervisor)";

/** The stub domain's own save, which a part that asks a lasting act runs (t598: a Core wait declaring one leaves nothing). */
const SAVE = "domain.isolated.save";

/**
 * A part's script, one short wait; the router-run subflow's plan, a start and an end.
 * A part that asks a lasting act does it with the domain's save, declared on that step, as a real script must (t597).
 */
function submission(subflowKey: string, asked: readonly string[] = []): JsonObject {
  const step = asked.length ? ["  step save: save it", `    node: ${SAVE}`, `    consequences: ${asked.join(", ")}`] : ["  step pause: wait briefly", "    node: builtin.timing.wait", "    duration: 1", "    unit: milliseconds"];
  if (subflowKey !== "main") return { flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, ...step, "end"].join("\n") };
  return { summary: "Build the main subflow", plan: { schemaVersion: "0.1", router: { name: "Main", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows: [{ key: "main", name: "Main", role: "primary", ...START_END }] } };
}

/** The stub domain's nodes: its save, which succeeds and changes nothing a test reads. */
function saveRuntime(): AutomationStudioNativeNodeRuntime {
  const node: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: SAVE, version: "1.0.0", label: "Save", description: "Save it.", category: "action",
    source: { kind: "importer", domainId: "isolated", packageId: "isolated.stub", implementationKey: SAVE },
    availability: { kind: "domain", domainId: "isolated" }, requiredRuntimeCapabilities: ["isolated.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters: [],
    outputAction: { fixedOutputId: SAVE }
  };
  return new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["isolated.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "isolated.stub", packageVersion: "1.0.0", domainId: "isolated", nodes: [node] },
    { packageId: "isolated.stub", packageVersion: "1.0.0", implementations: { [SAVE]: () => ({ status: "success" as const, route: "success", outputs: { success: true } }) } }
  );
}

/** Each builder: its own extra moves first, then submit, test, and complete on a yes. */
function builderDecision(subflowKey: string, evidence: readonly Entry[], first: (evidence: readonly Entry[]) => JsonObject | undefined, asked: readonly string[] = []): JsonObject {
  const own = first(evidence);
  if (own) return own;
  const submitted = lastOf(evidence, "core.submit_subflow");
  const tested = lastOf(evidence, "core.test_subflow");
  if (submitted?.ok !== true) return { kind: "tool_call", callId: `submit-${subflowKey}`, toolId: "core.submit_subflow", input: submission(subflowKey, asked) };
  if (tested?.verdict !== "yes") return { kind: "tool_call", callId: `test-${subflowKey}`, toolId: "core.test_subflow", input: { revision: submitted.revision as number, digest: submitted.digest as string } };
  return { kind: "complete", result: { subflowKey, revision: submitted.revision as number, digest: submitted.digest as string } };
}

/** The lasting acts the plan's task spec files under a subflow's parts. */
function askedActs(plan: JsonObject, subflowKey: string): string[] {
  const spec = plan.taskSpec as { parts: { id: string; lastingActs: string[] }[] };
  const parts = (plan.subflows as { key: string; parts: string[] }[]).find((subflow) => subflow.key === subflowKey)?.parts ?? [];
  return [...new Set(spec.parts.filter((part) => parts.includes(part.id)).flatMap((part) => part.lastingActs))];
}

async function build(input: {
  plan: JsonObject;
  briefs: JsonObject[];
  tools: NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>["tools"];
  executeTool: (call: { callId: string; toolId: string; value: JsonObject; permission?: AutomationStudioActionPermissionCheck }) => Promise<unknown>;
  builderFirst?: (subflowKey: string, evidence: readonly Entry[]) => JsonObject | undefined;
  permittedConsequences?: AutomationStudioActionConsequence[];
  prepareStart?: AutomationStudioServiceOptions["prepareCandidateStart"];
  startState?: NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>["startState"];
}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-brief-ports-"));
  /** Each builder's evidence at its first decision, by subflow. */
  const firstSeen: Record<string, Entry[]> = {};
  /** Each builder's evidence at its latest decision, by subflow. */
  const latestSeen: Record<string, Entry[]> = {};
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request) => {
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    const loop = request.context.evidenceLoop;
    const evidence = (loop?.evidence ?? []) as Entry[];
    const tools = (loop?.tools ?? []).map((tool) => tool.toolId);
    // The instruction's own read: no answer.
    if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      latestSeen[SUPERVISOR] = evidence.map((entry) => structuredClone(entry));
      if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: input.plan });
      if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build each subflow the plan needs.", briefs: input.briefs } });
      return decision({ kind: "complete", result: { ended: "partial", reason: "Only the briefs were under test." } });
    }
    const subflowKey = ((loop!.completionSchema.properties as JsonObject | undefined)?.subflowKey as JsonObject | undefined)?.const as string;
    firstSeen[subflowKey] ??= evidence.map((entry) => structuredClone(entry));
    latestSeen[subflowKey] = evidence.map((entry) => structuredClone(entry));
    return decision(builderDecision(subflowKey, evidence, (seen) => input.builderFirst?.(subflowKey, seen), askedActs(input.plan, subflowKey)));
  });
  const service = new AutomationStudioService({
    dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 80, maxEstimatedCostUsd: 0.1 }),
    llmEvidenceRuntime: { domainId: "isolated", deniedEvidenceKeys: [], tools: input.tools, executeTool: input.executeTool, ...(input.startState ? { startState: input.startState } : {}), resolvePlanNodeParameters: automationStudioTestDeclaredStepResolution } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>,
    ...(input.prepareStart ? { prepareCandidateStart: input.prepareStart } : {})
  });
  service.bindNativeNodeRuntime(saveRuntime());
  cleanups.push(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const { project, flow } = await blankFixture(service, "active", "isolated");
  return {
    service, firstSeen, latestSeen,
    run: () => service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", ...(input.permittedConsequences ? { permittedConsequences: input.permittedConsequences } : {}) })
  };
}

describe("a dependent builder's entry", () => {
  it("runs the predecessor's passing proposal before the builder's first look, which looks in place and says so", async () => {
    /** Everything in the order it happened: the domain's calls and the runtime sessions written. */
    const happened: string[] = [];
    const plan = {
      taskSpec: {
        parts: [
          { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: [] },
          { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }
        ],
        notAsked: []
      },
      subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"], after: ["first"] }]
    };
    const brief = (subflowKey: string, parts: string[], predecessors: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors }, allowanceUsd: 0.01, maxIterations: 8 });
    const run = await build({
      plan, briefs: [brief("first", ["p1"], []), brief("second", ["p2"], ["first"])],
      // The domain's look, which a build told its start opens by arriving there.
      tools: [{ toolId: "look", description: "Look at the page, or go somewhere first", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { look: true }, arrival: { go: "start" } } }],
      executeTool: async (call) => {
        happened.push(`call ${call.callId} ${JSON.stringify(call.value)}`);
        return { kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: call.value.go !== undefined, targetsUnchanged: call.value.go === undefined };
      }
    });
    const service = run.service as unknown as { writeRuntimeSession(projectId: string, session: { status: string; metadata?: JsonObject }, ...rest: unknown[]): Promise<unknown> };
    const write = service.writeRuntimeSession.bind(service);
    vi.spyOn(service, "writeRuntimeSession").mockImplementation(async (projectId, session, ...rest) => {
      const entry = session.metadata?.entryPreparation as JsonObject | undefined;
      const trial = session.metadata?.subflowTrial as JsonObject | undefined;
      if (entry) happened.push(`entry for ${String(entry.subflowKey)} ${session.status}`);
      else if (trial) happened.push(`trial of ${String(trial.subflowKey)} ${session.status}`);
      return await write(projectId, session, ...rest);
    });
    await run.run().catch(() => undefined);

    const opening = (subflowKey: string) => run.firstSeen[subflowKey]?.[0];
    // The first builder has no predecessor: it arrives at the start and is told nothing about an entry, only how its start was made (t593).
    expect(opening("first")).toMatchObject({ callId: "initial.look", value: { phaseStart: { phase: "builder", startHook: "none", arrival: "opening" } } });
    expect((opening("first")!.value as JsonObject).entry).toBeUndefined();
    // The second's opening is a look in place, after the first's passing proposal ran to its end in a session of its own.
    const firstPassed = happened.indexOf("trial of first succeeded");
    const entryRan = happened.indexOf("entry for second succeeded");
    const secondLook = happened.lastIndexOf(`call initial.look ${JSON.stringify({ look: true, arrived: true })}`);
    expect(firstPassed).toBeGreaterThanOrEqual(0);
    expect(entryRan).toBeGreaterThan(firstPassed);
    expect(secondLook).toBeGreaterThan(entryRan);
    // Sent marked as the second builder's arrival: its entry was reached from the start (t585).
    expect(happened.filter((line) => line.startsWith("call initial.look"))).toEqual([`call initial.look ${JSON.stringify({ go: "start" })}`, `call initial.look ${JSON.stringify({ look: true, arrived: true })}`]);
    expect(opening("second")).toMatchObject({ callId: "initial.look", value: { seen: true, entry: { prepared: true } } });
    expect(((opening("second")!.value as JsonObject).entry as JsonObject).note).toContain(`the subflows before yours ("first")`);
    // The first's part makes no lasting act, so nothing is named as left (t638).
    expect((opening("second")!.value as JsonObject).entry).not.toHaveProperty("predecessorsLeftOnSite");
  });

  it("marks the acts its start hook put back undone in their ledgers before the builder looks, and names them at its opening", async () => {
    const happened: string[] = [];
    const plan = {
      taskSpec: {
        parts: [
          { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: ["create_new"] },
          { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }
        ],
        notAsked: []
      },
      subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"], after: ["first"] }]
    };
    const brief = (subflowKey: string, parts: string[], predecessors: string[], permittedActs: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors }, allowanceUsd: 0.01, maxIterations: 8, permittedActs });
    const run = await build({
      plan, briefs: [brief("first", ["p1"], [], ["create_new"]), brief("second", ["p2"], ["first"], [])],
      tools: [
        { toolId: "look", description: "Look at the page, or go somewhere first", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { look: true }, arrival: { go: "start" } } },
        { toolId: "press", description: "Press a control on one list", inputSchema: { type: "object", properties: { control: { type: "string" }, item: { type: "string" } } }, effect: "mutate" }
      ],
      executeTool: async (call) => {
        if (call.toolId !== "press") return { kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: call.value.go !== undefined, targetsUnchanged: call.value.go === undefined };
        const declaration: AutomationStudioActionDeclaration = { consequences: ["create_new"], control: { name: "Save", kind: "button", item: "list-1" }, verb: "press", effect: "mutate" };
        const verdict = await call.permission!(declaration);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted, targetsUnchanged: !verdict.permitted };
      },
      // The first builder saves once after its own passing trial, so the act is still on the site when the second's entry is prepared.
      builderFirst: (subflowKey, evidence) => {
        if (subflowKey === "second" && !happened.includes("second decides")) happened.push("second decides");
        return subflowKey === "first" && lastOf(evidence, "core.test_subflow")?.verdict === "yes" && !lastOf(evidence, "press")
          ? { kind: "tool_call", callId: "save", toolId: "press", input: { control: "Save", item: "list-1", consequences: ["create_new"] } }
          : undefined;
      },
      prepareStart: async () => {
        happened.push("start hook");
        return { reset: true };
      }
    });
    const service = run.service as unknown as { writeRuntimeSession(projectId: string, session: { status: string; metadata?: JsonObject }, ...rest: unknown[]): Promise<unknown> };
    const write = service.writeRuntimeSession.bind(service);
    vi.spyOn(service, "writeRuntimeSession").mockImplementation(async (projectId, session, ...rest) => {
      const entry = session.metadata?.entryPreparation as JsonObject | undefined;
      if (entry) happened.push(`entry for ${String(entry.subflowKey)} ${session.status}`);
      return await write(projectId, session, ...rest);
    });
    // Each ledger asked after a start hook: the acts it held in place before, and after.
    const beforeTrial = AutomationStudioSiteResetLedger.prototype.beforeTrial;
    const spied = vi.spyOn(AutomationStudioSiteResetLedger.prototype, "beforeTrial");
    cleanups.push(async () => { spied.mockRestore(); });
    spied.mockImplementation(async function (this: AutomationStudioSiteResetLedger, ...args: Parameters<typeof beforeTrial>) {
      const held = this.inPlace().map((act) => act.act);
      const answer = await beforeTrial.apply(this, args);
      if (args[2]?.startReset === true) happened.push(`ledger put back ${JSON.stringify(held)}, now ${JSON.stringify(this.inPlace().map((act) => act.act))}`);
      return answer;
    });
    await run.run().catch(() => undefined);

    // The second's start ran the start hook; the ledger holding the first builder's save marked it undone before its predecessor
    // ran to its entry (the build's one start, t593: the reset before the entry), and both before the second builder's first look.
    // The first's part asks a lasting act, so its subflow declares one (t597): its own passing trial left act-1, and its save
    // after it is act-2; the hook put back both.
    const entryRan = happened.indexOf("entry for second succeeded");
    expect(entryRan).toBeGreaterThan(0);
    const decides = happened.indexOf("second decides");
    expect(decides).toBeGreaterThan(entryRan);
    const putBack = happened.indexOf(`ledger put back ${JSON.stringify(["act-1", "act-2"])}, now []`);
    expect(putBack, JSON.stringify(happened)).toBeGreaterThan(happened.indexOf("start hook"));
    expect(putBack).toBeLessThan(entryRan);
    expect(run.firstSeen.second?.[0]).toMatchObject({ callId: "initial.look", value: { entry: { prepared: true, absorbedByStartReset: ["act-1", "act-2"] }, phaseStart: { phase: "builder", startHook: "ran", putBack: ["act-1", "act-2"], arrival: "none", predecessors: { ran: ["first"], prepared: true } } } });
    // The save the preparation run landed is named as the project ledger holds it, with what to do if a part of the second asks for it (t638).
    const entry = (run.firstSeen.second?.[0]?.value as JsonObject).entry as JsonObject;
    expect(entry.predecessorsLeftOnSite).toEqual([{ act: "act-3", did: expect.stringMatching(/^trial step \d+ /u) }]);
    expect(entry.note).toContain("Their lasting acts are under predecessorsLeftOnSite");
    // The second's part only reads, so no predecessor can have done it: it is told to build from here, never to end blocked (t676).
    expect(entry.note).toContain("Your parts ask for no lasting act, so none of these is a part of yours: build your parts from this page.");
    expect(entry.note).not.toContain("end the brief blocked");
    expect(entry.note).not.toContain("what they did is already done");
  });
});

describe("a brief whose parts ask for no lasting act", () => {
  it("puts its deleting press to the person's gate although the build was permitted it, and tells it a modifying press was outside its brief", async () => {
    const verdicts: Array<{ control: string; permitted: boolean; missing: readonly string[] }> = [];
    const asked: unknown[] = [];
    const plan = {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
      subflows: [{ key: "main", name: "Main", parts: ["p1"] }]
    };
    const run = await build({
      plan, permittedConsequences: ["delete", "modify_existing"],
      briefs: [{ kind: "build", subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 8, permittedActs: [] }],
      tools: [{ toolId: "press", description: "Press a control on one list", inputSchema: { type: "object", properties: { control: { type: "string" }, item: { type: "string" } } }, effect: "mutate" }],
      executeTool: async (call) => {
        const control = String(call.value.control);
        const declaration: AutomationStudioActionDeclaration = { consequences: control === "Remove" ? ["delete"] : ["modify_existing"], control: { name: control, kind: "button", item: String(call.value.item) }, verb: "press", effect: "mutate" };
        const verdict = await call.permission!(declaration);
        verdicts.push({ control, permitted: verdict.permitted, missing: verdict.permitted ? [] : verdict.missing });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false, targetsUnchanged: true };
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, renamed: true }, effectApplied: true, targetsUnchanged: false };
      },
      // The builder presses Remove, then Rename, declaring each, before it submits.
      builderFirst: (_subflowKey, evidence) => {
        const presses = evidence.filter((entry) => entry.toolId === "press").length;
        if (presses === 0) return { kind: "tool_call", callId: "remove", toolId: "press", input: { control: "Remove", item: "list-1", consequences: ["delete"] } };
        if (presses === 1) return { kind: "tool_call", callId: "rename", toolId: "press", input: { control: "Rename", item: "list-1", consequences: ["modify_existing"] } };
        return undefined;
      }
    });
    // The person's thread, which answers every question no.
    const thread: AutomationStudioParkingPort = {
      open: (ask) => { asked.push(structuredClone(ask)); },
      awaitAnswer: async (ask) => ({ askId: ask.askId, answeredAt: 1, kind: "deny", value: null, actorId: "person" }) satisfies AutomationStudioAskAnswer
    };
    vi.spyOn(run.service.conversations, "parkingPort").mockReturnValue(thread);
    await run.run().catch(() => undefined);

    // Remove was put to the person (asked once, declined), although the person permitted the build to delete; Rename ran.
    expect(verdicts).toEqual([{ control: "Remove", permitted: false, missing: ["delete"] }, { control: "Rename", permitted: true, missing: [] }]);
    expect(asked).toHaveLength(1);
    expect(JSON.stringify(asked[0])).toContain("delete");
    // The refused Remove says nothing about the brief; the Rename that ran is told it was outside it, beside the domain's own evidence.
    const result = (callId: string) => run.latestSeen.main?.find((entry) => entry.callId === callId)?.value as JsonObject | undefined;
    expect(result("remove")).not.toHaveProperty("outsideBrief");
    expect(result("rename")).toMatchObject({ ok: true, renamed: true, outsideBrief: { consequences: ["modify_existing"] } });
    expect((result("rename")!.outsideBrief as JsonObject).note).toContain("they ask for no lasting act");
  });
});

// A8 wave 7 `run-mv9dd0fk-8cd2e522` (t630): a builder given an input none of its steps could use was refused
// `subflow.input_unread` three times and stopped; its return said "subflow.scope_refused:b54daa6d" and nothing more.
describe("a brief whose builder never reads the input the plan gives it", () => {
  it("comes back blocked naming the refused submission's issue and the input, with the plan's advice", async () => {
    const plan = {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [] }], notAsked: [] },
      subflows: [{ key: "second", name: "second", parts: ["p1"], inputs: ["titles"] }]
    };
    const run = await build({
      plan,
      briefs: [{ kind: "build", subflowKey: "second", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations: 8 }],
      tools: [{ toolId: "look", description: "Look at the page", inputSchema: { type: "object" }, effect: "observe" }],
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { seen: true }, effectApplied: false, targetsUnchanged: true }),
      // Each submission declares the input and reads it nowhere, a little different each time, as the live builder's were.
      builderFirst: (_subflowKey, evidence) => {
        const sent = evidence.filter((entry) => entry.toolId === "core.submit_subflow").length;
        const flow = ["flow: second", "part second: carry out its part", "  input: titles", "  step pause: wait briefly", "    node: builtin.timing.wait", `    duration: ${sent + 1}`, "    unit: milliseconds", "end"].join("\n");
        return { kind: "tool_call", callId: `submit-${sent + 1}`, toolId: "core.submit_subflow", input: { flow } };
      }
    });
    await run.run().catch(() => undefined);

    const refusals = (run.latestSeen.second ?? []).filter((entry) => entry.toolId === "core.submit_subflow").map((entry) => entry.value as JsonObject);
    expect(refusals.length).toBeGreaterThanOrEqual(2);
    for (const refused of refusals) expect(refused).toMatchObject({ ok: false, issueCodes: ["subflow.input_unread"] });
    const dispatched = lastOf(run.latestSeen[SUPERVISOR] ?? [], "project.dispatch");
    const returned = (dispatched?.returns as JsonObject[] | undefined)?.[0];
    expect(returned, JSON.stringify(dispatched)).toMatchObject({ subflowKey: "second", outcome: "blocked" });
    const reason = String(returned!.reason);
    expect(reason).toContain("core.submit_subflow answered subflow.scope_refused (subflow.input_unread: input \"titles\") (3 in a row)");
    // No other subflow hands `titles` on, so it is the person's value, and the advice is to give it where it is used (t672).
    expect(reason).toContain("The plan gives this subflow a value the person gives the Flow, and no step of it reads that value: if another subflow is the one that uses it, change the plan with project.amend_plan");
    expect(reason).not.toMatch(/subflow\.scope_refused:[0-9a-f]{8}/u);
    expect(reason).not.toContain("candidate.last_submission");
  });
});

it("requires a pre-create baseline through normal project ports and recovers via an actual observation/ref retry", async () => {
  let at = "source", phase = 0, creates = 0, removals = 0;
  let reference: string | undefined, act: string | undefined;
  const rows = ["s:baseline"];
  const inputs: JsonObject[] = [];
  const plan = {
    taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: ["create_new"] }], notAsked: [] },
    subflows: [{ key: "keep", name: "Keep", parts: ["p1"] }]
  };
  const invoke = (callId: string, node: string, consequences: string[] = [], extra: JsonObject = {}): JsonObject => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters: {}, consequences, ...extra } });
  const run = await build({
    plan, briefs: [{ kind: "build", subflowKey: "keep", parts: ["p1"], permittedActs: ["create_new"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.02, maxIterations: 20 }], permittedConsequences: ["create_new"],
    tools: [{ toolId: "core.run_node", description: "Run an observed operation", effect: "mutate", perCallEffect: true, inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array", items: { type: "string" } } } }, initialObservation: { input: { node: "example.look", parameters: {}, consequences: [] } } }],
    startState: async () => ({ state: { at }, differs: [], location: at, resource: "r:one", scope: `p:${at}`, collections: at === "destination" ? [{ scope: "p:destination", group: "g:destination", subjects: [...rows], states: Object.fromEntries(rows.map(row => [row, `v:${row}`])) }] : [] }),
    executeTool: async (call) => {
      inputs.push(call.value);
      const operation = call.value.node;
      if (operation === "example.destination" || operation === "example.source") at = operation === "example.destination" ? "destination" : "source";
      if (operation !== "example.create" && operation !== "example.remove") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false };
      const removing = operation === "example.remove";
      const verdict = await call.permission!({ consequences: removing ? ["delete"] : ["create_new"], effect: "mutate", control: { name: "Control", subject: "s:document", resource: "r:one", scope: removing ? "p:destination" : "p:source" }, verb: "press" });
      if (verdict.permitted) {
        if (removing) {
          rows.splice(rows.indexOf("s:document"), 1);
          removals++;
        } else {
          rows.push("s:document");
          creates++;
        }
      }
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
    },
    builderFirst: (_key, evidence) => {
      phase++;
      if (phase === 1) return invoke("create.missing", "example.create", ["create_new"]);
      if (phase === 2) {
        expect(lastOf(evidence, "core.run_node")).toMatchObject({ code: "candidate.create_baseline_required" });
        expect(creates).toBe(0);
        return invoke("destination", "example.destination");
      }
      if (phase === 3) {
        const destinations = lastOf(evidence, "core.run_node")?.resetDestinations as { collections?: Array<{ ref: string }> } | undefined;
        reference = destinations?.collections?.[0]?.ref;
        if (!reference) return { kind: "complete", result: { subflowKey: "keep", revision: 0, digest: "missing-original-receipt" } };
        return invoke("source", "example.source");
      }
      if (phase === 4) return invoke("create.retry", "example.create", ["create_new"], { resetDestination: reference! });
      if (phase === 5) return undefined; // the normal builder submits its subflow
      const submitted = lastOf(evidence, "core.submit_subflow")!;
      const candidate = { revision: submitted.revision as number, digest: submitted.digest as string };
      if (phase === 6) return { kind: "tool_call", callId: "test.dirty", toolId: "core.test_subflow", input: candidate };
      if (phase === 7) {
        const dirty = lastOf(evidence, "core.test_subflow")!;
        expect(dirty.code).toBe("candidate.trial_reset_required");
        act = (dirty.actsToUndo as JsonObject[])[0]!.act as string;
        return invoke("undo.destination", "example.destination");
      }
      if (phase === 8) return invoke("undo", "example.remove", ["delete"], { undoes: act! });
      if (phase === 9) return { kind: "tool_call", callId: "test.clean", toolId: "core.test_subflow", input: candidate };
      return undefined;
    }
  });
  let failed: { diagnostic?: { code?: string; issueCodes?: string[] }; message?: string } | undefined;
  await run.run().catch(error => { failed = error; });
  if (!reference) throw new Error(JSON.stringify({ phase, failure: failed?.diagnostic, message: failed?.message, inputs: inputs.map(input => input.node), seen: (run.latestSeen.keep ?? []).map(entry => ({ callId: entry.callId, keys: Object.keys(entry.value as object), code: (entry.value as JsonObject).code })) }));
  expect(reference).toMatch(/^destination-[1-9][0-9]*$/u);
  expect(creates).toBe(1);
  expect(removals).toBe(1);
  expect(rows).toEqual(["s:baseline"]);
  expect(inputs.every(input => !Object.hasOwn(input, "resetDestination"))).toBe(true);
  expect(lastOf(run.latestSeen.keep ?? [], "core.test_subflow")).toMatchObject({ verdict: "yes" });
});

// Office rounds 2-4 (t748, C6; `run-mvgf04kw-310fc169`, `run-mvgvyaip-d856e135`): after a press was refused for want of a
// ref, the builder read the list where its effect shows, which issued the ref, and nothing told it to press again with it;
// it went back and forth for 9 and 14 turns. That read's answer now names the refused call and the refs just issued. A
// made-up library: a book's page with no list, and the loans list on a page of its own.
describe("a press refused for want of a ref", () => {
  it.each([
    ["create_new", "candidate.create_baseline_required"],
    ["modify_existing", "candidate.reset_witness_required"]
  ] as const)("is named, with the refs a later complete read issued, on that read's answer alone (%s)", async (consequence, code) => {
    let at = "shelf", phase = 0;
    const loans = ["s:dune"];
    const seen: Record<string, JsonObject | undefined> = {};
    const plan = {
      taskSpec: { parts: [{ id: "p1", quote: { sourceId: "instruction.build", text: TASK }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: [consequence] }], notAsked: [] },
      subflows: [{ key: "lend", name: "Lend", parts: ["p1"] }]
    };
    const invoke = (callId: string, node: string, extra: JsonObject = {}): JsonObject => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters: {}, consequences: node === "example.press" ? [consequence] : [], ...extra } });
    const run = await build({
      plan, briefs: [{ kind: "build", subflowKey: "lend", parts: ["p1"], permittedActs: [consequence], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.02, maxIterations: 20 }], permittedConsequences: [consequence],
      tools: [{ toolId: "core.run_node", description: "Run an observed operation", effect: "mutate", perCallEffect: true, inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array", items: { type: "string" } } } }, initialObservation: { input: { node: "example.look", parameters: {}, consequences: [] } } }],
      startState: async () => ({ state: { at }, differs: [], location: `loc:${at}`, resource: "r:library", scope: `p:${at}`, collections: at === "loans" ? [{ scope: "p:loans", group: "g:loans", subjects: [...loans], states: Object.fromEntries(loans.map((subject) => [subject, `v:${subject}`])) }] : [] }),
      executeTool: async (call) => {
        const operation = call.value.node;
        if (operation === "example.loans" || operation === "example.shelf") at = operation === "example.loans" ? "loans" : "shelf";
        if (operation !== "example.press") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: false };
        // About the book, on its own page, in no list: a creation identified by its subject, or a modification with no witness.
        const verdict = await call.permission!({ consequences: [consequence], effect: "mutate", control: { name: "Borrow", subject: "s:atlas", page: "s:atlas", resource: "r:library", scope: "p:shelf" }, verb: "press" });
        if (verdict.permitted) loans.push("s:atlas");
        return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
      },
      builderFirst: (_key, evidence) => {
        phase++;
        const last = lastOf(evidence, "core.run_node");
        if (phase === 1) return invoke("press.missing", "example.press");
        if (phase === 2) {
          seen.refused = last;
          return invoke("loans", "example.loans");
        }
        if (phase === 3) {
          seen.read = last;
          return invoke("shelf", "example.shelf");
        }
        if (phase === 4) {
          seen.back = last;
          const ref = ((seen.read?.resetDestinations as JsonObject | undefined)?.collections as JsonObject[] | undefined)?.[0]?.ref as string | undefined;
          return invoke("press.retry", "example.press", ref === undefined ? {} : { resetDestination: ref });
        }
        if (phase === 5) {
          seen.retried = last;
          return invoke("loans.again", "example.loans");
        }
        if (phase === 6) seen.again = last;
        return { kind: "complete", result: { subflowKey: "lend", revision: 0, digest: "only-the-reads-were-under-test" } };
      }
    });
    await run.run().catch(() => undefined);

    // The refusal itself, and a page that printed no list, carry no such note.
    expect(seen.refused).toMatchObject({ code });
    expect(seen.refused).not.toHaveProperty("retryRefused");
    // The complete read that issued the ref names the refused call and that ref, and says to make the call again with it.
    expect(seen.read).toMatchObject({ resetDestinations: { collections: [{ ref: "destination-1", count: 1 }] }, retryRefused: { call: "press.missing", refs: [{ ref: "destination-1", count: 1 }] } });
    const instruction = String((seen.read!.retryRefused as JsonObject).instruction);
    expect(instruction).toContain("\"press.missing\"");
    expect(instruction).toContain("destination-1 (1 item)");
    expect(instruction).toContain("resetDestination");
    expect(seen.back).toEqual({ ok: true });
    // Pressed again with the ref, it ran; a later read of the same list is not told again.
    expect(seen.retried).toEqual({ ok: true });
    expect(loans).toEqual(["s:dune", "s:atlas"]);
    expect(seen.again).toMatchObject({ resetDestinations: { collections: [{ ref: "destination-1" }] } });
    expect(seen.again).not.toHaveProperty("retryRefused");
  });
});
