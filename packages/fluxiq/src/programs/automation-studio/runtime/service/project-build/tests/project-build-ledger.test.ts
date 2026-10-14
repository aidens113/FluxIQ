// A project build's lasting acts (unit A5c): a whole trial's own acts are
// recorded under the supervisor in the project ledger, where the supervisor's
// trial refusal and a reset brief see them; a reset brief's undo of any
// agent's act is put to the ledger that owns it; and a brief's call cap leaves
// room for its subflow trials' judges.
import { describe, expect, it } from "vitest";
import type { AutomationStudioProjectSubflowBrief } from "../../../project-agents/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { trialFixture } from "../../candidate-trial/tests/fixtures.ts";
import { automationStudioProjectBuildBriefCalls } from "../brief-calls.ts";
import { automationStudioProjectBuildResetCalls } from "../reset-calls.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER, automationStudioProjectBuildWholeTrials } from "../index.ts";

const BINDING = { domainId: "isolated", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: {}, effectApplied: false, targetsUnchanged: true }) };
const judge = { provider: mockProvider(async () => judgeReply("yes")), instructions: [] };

/** A whole-trial fixture whose one press lands with `consequences`. */
function pressingTrial(consequences: string[]) {
  const fixture = trialFixture(consequences);
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
  const { judge: _judge, ...environment } = fixture.ports;
  return { fixture, environment };
}

function brief(kind: AutomationStudioProjectSubflowBrief["kind"], maxIterations: number): AutomationStudioProjectSubflowBrief {
  return { briefId: "brief-1", kind, planDigest: "d".repeat(64), subflowKey: "main", parts: ["p1"], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.01, maxIterations, permittedActs: [] };
}

describe("a project build's lasting acts", () => {
  it("records a whole trial's own lasting acts under the supervisor, in place until undone", async () => {
    const { fixture, environment } = pressingTrial(["create_new"]);
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment, binding: BINDING, judge, ledger });
    const result = await trials.port(fixture.request());
    expect(result.acts).toHaveLength(1);
    expect(ledger.snapshot().acts).toEqual([expect.objectContaining({ act: "act-1", owner: AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER, inPlace: true })]);
    expect(trials.records()).toHaveLength(1);
  });

  it("records nothing for a candidate build, which keeps its own ledger, and nothing for a trial that left no lasting act", async () => {
    const quiet = pressingTrial([]);
    const ledger = new AutomationStudioSiteResetProjectLedger();
    await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: quiet.environment, binding: BINDING, judge, ledger }).port(quiet.fixture.request());
    expect(ledger.snapshot().acts).toEqual([]);
    const lasting = pressingTrial(["create_new"]);
    const result = await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: lasting.environment, binding: BINDING, judge }).port(lasting.fixture.request());
    expect(result.acts).toHaveLength(1);
  });

  it("keeps the deployment's start hook on the whole trial's port, so it runs before each whole trial", async () => {
    const { environment } = pressingTrial(["create_new"]);
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: { ...environment, prepareStart: async () => ({ fixture: "reset" }) }, binding: BINDING, judge, ledger: new AutomationStudioSiteResetProjectLedger() });
    expect(typeof trials.port.prepareStart).toBe("function");
  });

  it("puts a reset's undo to the ledger that owns the act, and a call naming no act to the reset's own", () => {
    const ledger = new AutomationStudioSiteResetProjectLedger();
    ledger.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER).trialRan([{ step: 2, definitionId: "custom.press", consequences: ["create_new"] }], "trial.1");
    ledger.forBrief("brief-1").trialRan([{ step: 1, definitionId: "custom.press", consequences: ["modify_existing"] }], "subflow-trial.1");
    const own = ledger.forBrief("brief-reset");
    const calls = automationStudioProjectBuildResetCalls(ledger, own);
    expect(calls.claim("act-1")).toMatchObject({ kind: "undo", undo: { act: "act-1" } });
    expect(calls.claim("act-2")).toMatchObject({ kind: "undo", undo: { act: "act-2" } });
    // The reset's own ledger knows neither act: asked directly, it refuses.
    expect(own.claim("act-1")).toMatchObject({ kind: "refused" });
    expect(calls.claim("act-9")).toMatchObject({ kind: "refused" });
    expect(calls.claim(undefined)).toEqual({ kind: "none" });
  });

  it("caps a build brief's calls at three per decision, for its trials' judges, and a reset's at its decisions", () => {
    expect(automationStudioProjectBuildBriefCalls(brief("build", 6))).toBe(18);
    expect(automationStudioProjectBuildBriefCalls(brief("repair", 4))).toBe(12);
    expect(automationStudioProjectBuildBriefCalls(brief("reset", 5))).toBe(5);
  });
});
