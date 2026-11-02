import { describe, expect, it, vi } from "vitest";
import { AdmissionTestPersistence } from "../../../../../../runtime/execution-admission/tests/persistence.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "../whole-trials.ts";
import { automationStudioProjectBuildSubflowTrials } from "../subflow-trials.ts";
import { AutomationStudioProjectBuildProposals } from "../proposals.ts";
import { mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { bindTrialExecutionSource } from "../../../candidate-trials/observation/index.ts";
import { partialAdmissionFixture } from "../../../candidate-trials/partial/tests/fixture.ts";

describe("the project partial wrapper preserves the original configured source", () => {
  it("admits an unknown offline-first choice before the callback and refuses a second live fallback", async () => {
    const persistence = new AdmissionTestPersistence();
    const f = await partialAdmissionFixture({ persistence, port: async () => { throw new Error("unused fixture port"); } });
    const environment: AutomationStudioProjectBuildTrialEnvironment = {
      projectId: "project.isolated", flowId: "flow.actual", registry: f.registry, resolution: f.resolution, sourceInstructionIds: ["instruction.isolated"],
      parentFlow: async () => { throw new Error("a choice must not load a live Flow"); },
      currentBaseDigest: async () => "base", snapshots: async () => [], deprecatedPublicationIds: async () => [],
      openSession: async () => { throw new Error("a choice must not start a live session"); },
      writeSession: async () => { throw new Error("a choice must not write a live session"); },
      graphOptions: () => { throw new Error("a choice must not dispatch a live Flow"); },
      processDatasets: async () => { throw new Error("a choice must not process a live run"); }, recordSets: async () => []
    };
    bindTrialExecutionSource(environment, f.configured);
    const trials = automationStudioProjectBuildSubflowTrials({
      ref: { projectId: "project.isolated", flowId: "flow.actual", buildId: f.scope.buildId }, environment,
      binding: { domainId: "controlled", deniedEvidenceKeys: [], tools: [], executeTool: async () => { throw new Error("a choice must not execute a live tool"); } },
      judge: { provider: mockProvider(async () => { throw new Error("a choice must not call a provider"); }) },
      records: { read: async () => undefined }, proposals: new AutomationStudioProjectBuildProposals(), leases: { assertCurrent: () => undefined }, running: () => true
    });
    const prepared = vi.spyOn(f.callbacks, "prepare");
    const request = () => ({ scope: structuredClone(f.scope), proposal: structuredClone(f.proposal), signal: new AbortController().signal });
    const choose = trials.port.offlineFirst;
    if (!choose) throw new Error("The public choice is required.");
    expect(await choose(request())).toMatchObject({ kind: "live", note: { outcome: "not_tried" } });
    expect(prepared).toHaveBeenCalledTimes(1);
    expect(persistence.events).toContain("enter");
    expect((await f.assembly.consumer.inspect(f.executionScope)).state).toBe("unverified");
    await expect(choose(request())).rejects.toThrow();
    expect(prepared).toHaveBeenCalledTimes(1);
    expect(trials.records()).toEqual([]);
  });
});
