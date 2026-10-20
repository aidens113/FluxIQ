// A project build's trial wrappers keep the inner port's environment kind
// (traces and offline trials, U7): the whole trials' and the subflow trials'
// ports each carry the `environmentKind` of the port they wrap, so the trial
// gate still sees an offline trial as offline. A whole trial's acts go to the
// build's reset ledgers only when it ran live; an offline trial's acts never
// happened on the site (Decision 6). Through the real wrappers over the real
// inner ports; no model is called beyond the mock judge.
import { describe, expect, it } from "vitest";
import { automationStudioCandidateTrialOffline } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { createAutomationStudioScopedRunEnvironment, AutomationStudioVirtualClock } from "../../../environment/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import type { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { trialFixture } from "../../candidate-trial/tests/fixtures.ts";
import { subflowTrialFixture } from "../../subflow-trial/tests/fixtures.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { automationStudioProjectBuildWholeTrials, type AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";

const BINDING = { domainId: "isolated", deniedEvidenceKeys: [], tools: [], executeTool: async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: {}, effectApplied: false, targetsUnchanged: true }) };
const judge = { provider: mockProvider(async () => judgeReply("yes")), instructions: [] };

/** An offline environment of `kind`, sealed to its own channel scope. */
const offline = (kind: "trace" | "fixture") => createAutomationStudioScopedRunEnvironment({ kind, clock: new AutomationStudioVirtualClock(100) });

/** A whole-trial fixture whose one press lands as a lasting act. */
function pressingTrial() {
  const fixture = trialFixture(["create_new"]);
  fixture.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async () => ({ result: { status: "success", route: "success", outputs: {} } }) } as ReturnType<typeof fixture.ports.graphOptions>);
  const { judge: _judge, ...environment } = fixture.ports;
  return { fixture, environment };
}

describe("a project build's whole trials, wrapping the inner port (U7)", () => {
  it("live: keeps the start hook, says live, and writes the trial's acts to the ledger as before", async () => {
    const { fixture, environment } = pressingTrial();
    const ledger = new AutomationStudioSiteResetProjectLedger();
    const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: { ...environment, prepareStart: async () => ({ fixture: "reset" }) }, binding: BINDING, judge, ledger });
    expect(trials.port.environmentKind).toBe("live");
    expect(automationStudioCandidateTrialOffline(trials.port)).toBe(false);
    expect(typeof trials.port.prepareStart).toBe("function");
    const result = await automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment, binding: BINDING, judge, ledger }).port(fixture.request());
    expect(result.acts).toHaveLength(1);
    expect(ledger.snapshot().acts).toHaveLength(1);
  });

  for (const kind of ["trace", "fixture"] as const) {
    it(`${kind}: keeps the kind through the wrapper and writes nothing to the ledger`, async () => {
      const { fixture, environment } = pressingTrial();
      const ledger = new AutomationStudioSiteResetProjectLedger();
      const trials = automationStudioProjectBuildWholeTrials({ candidateId: "candidate.1", environment: { ...environment, environment: offline(kind), prepareStart: async () => ({ fixture: "reset" }) }, binding: BINDING, judge, ledger });
      expect(trials.port.environmentKind).toBe(kind);
      expect(automationStudioCandidateTrialOffline(trials.port)).toBe(true);
      // An offline trial runs no start hook, so the inner port offers none and neither does the wrapper.
      expect(trials.port.prepareStart).toBeUndefined();
      const result = await trials.port(fixture.request());
      expect(result.acts).toHaveLength(1);
      expect(ledger.snapshot().acts).toEqual([]);
    });
  }
});

const REF = { projectId: "project", flowId: "parent", buildId: "build.1" };
const records = { read: async () => undefined } as unknown as Pick<AutomationStudioProjectBuildRecordStore, "read">;

function subflowTrials(environmentOf?: ReturnType<typeof offline>) {
  const f = subflowTrialFixture();
  const { judge: _judge, predecessorProposals: _predecessors, ...environment } = f.ports;
  const given = environmentOf ? { ...environment, environment: environmentOf } : environment;
  return automationStudioProjectBuildSubflowTrials({
    ref: REF, environment: given as AutomationStudioProjectBuildTrialEnvironment, binding: BINDING as unknown as AutomationStudioLlmEvidenceRuntimeBinding,
    judge: { provider: mockProvider(async () => judgeReply("yes")) }, records, proposals: new AutomationStudioProjectBuildProposals(), leases: { assertCurrent: () => undefined }, running: () => true
  });
}

describe("a project build's subflow trials, wrapping the inner port (U7)", () => {
  it("live: says live", () => {
    expect(subflowTrials().port.environmentKind).toBe("live");
  });

  for (const kind of ["trace", "fixture"] as const) {
    it(`${kind}: keeps the kind through the wrapper`, () => {
      const trials = subflowTrials(offline(kind));
      expect(trials.port.environmentKind).toBe(kind);
      expect(automationStudioCandidateTrialOffline(trials.port)).toBe(true);
    });
  }
});
