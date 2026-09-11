import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAutomationStudioLargeProjectFixture } from "fluxiq/automation-studio";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 8 storage fixture integrity contract", () => {
  it("replaces temporary admin credentials with deterministic browser-safe fixture credentials", () => {
    const seed = read("e2e/support/seed-fixtures.mjs");

    expect(seed).toContain('const FIXTURE_PASSWORD = "FluxIQ-E2E-Admin!"');
    expect(seed).toContain('const FIXTURE_SECURITY_PIN = "123456"');
    expect(seed).toContain("identityAccess.setPassword(FIXTURE_USERNAME, FIXTURE_PASSWORD)");
    expect(seed).toContain("identityAccess.setPin(FIXTURE_USERNAME, FIXTURE_SECURITY_PIN)");
    expect(seed).toContain("studio.saveFlow({ projectId: project.id, flow: ownedFixtureFlow(project.id, artifact) })");
    expect(seed).not.toContain('saveProjectArtifact({ projectId: project.id, kind: "flow"');
    expect(seed).not.toContain('credentials: { username: "admin", password: "admin" }');
  });

  it("namespaces every recording to its owning project and records ownership in the manifest", () => {
    const seed = read("e2e/support/seed-fixtures.mjs");
    const verify = read("e2e/support/verify-fixtures.mjs");

    expect(seed).toContain("projectOwnedRecordingId(projectId");
    expect(seed).toContain("recordingIds: timelineRecordingId ? [timelineRecordingId] : []");
    expect(seed).toContain("recordingIds,");
    expect(seed).not.toContain('const recordingId = "recording.ui-stress-timeline"');
    expect(verify).toContain("assertManifestRecordingOwnership(manifest)");
    expect(verify).toContain("recording manifest ownership");
  });

  it("persists the generated Phase 8 recording collection through supported recording APIs", () => {
    const seed = read("e2e/support/seed-fixtures.mjs");
    const persistence = seed.slice(seed.indexOf("async function persistFixtureRecording"), seed.indexOf("async function seedGlobalStressFixtures"));

    expect(seed).toContain("index < fixture.recordings.length");
    expect(seed).toContain("recordingIds.length !== counts.recordings");
    expect(persistence).toContain("studio.createRecording");
    expect(persistence).toContain("studio.appendRecordingEvents");
    expect(persistence).toContain("studio.finalizeRecording");
  });

  it("marks fixture Flow artifacts with independently enumerable project ownership", () => {
    const seed = read("e2e/support/seed-fixtures.mjs");
    expect(seed).toContain("ownedFixtureFlow(project.id, artifact)");
    expect(seed).toContain('ownerKind: "project", ownerId: projectId');
    expect(seed).toContain("namespaceLargeFixtureIdentifiers(createAutomationStudioLargeProjectFixture");
    expect(seed).toContain("function namespaceLargeFixtureIdentifiers(fixture, namespace)");
  });

  it("derives every required Phase 8 count from paged storage or streamed corpora", () => {
    const verify = read("e2e/support/verify-fixtures.mjs");
    const verification = verify.slice(verify.indexOf("async function verifyPhase8Project"), verify.indexOf("async function collectOffsetItems"));

    expect(verification).not.toContain("project.counts");
    for (const storageQuery of [
      "studio.listProjects",
      "studio.listProjectArtifacts",
      "studio.listFlowSubflowSummaries",
      "studio.getProjectHierarchy",
      "studio.getProjectWorkspaceSummary",
      "studio.getFlow",
      "studio.getFlowRouter",
      "studio.listFlowRunSummaries",
      "studio.listFlowRunActions",
      "studio.listRecordingSessionSummaryPage",
      "studio.listFlowAdaptationSummaries",
      "countNdjson",
    ]) {
      expect(verification).toContain(storageQuery);
    }
    for (const count of ["flows", "subflows", "hierarchyObjects", "activeGraphNodes", "routes", "runEvents", "problems", "docs", "recordings", "runs", "adaptations"]) {
      expect(verification).toContain(count);
    }
    expect(verify).toContain("stable page total");
    expect(verify).toContain("collectOffsetItems");
    expect(verify).toContain("verifyOffsetTotal");
    expect(verify).toContain("final page");
    expect(verify).toContain("spawnSync");
    expect(verify).toContain('"base", "empty", "ordinary", "scale", "global"');
    expect(verify).toContain("action projection");
    expect(verify).toContain("mapInBatches(runs, 1");
    expect(verify).toContain("run ownership distribution");
  });

  it("gives every ordinary Flow enough owned runs for run-selection workflows", () => {
    const contract = JSON.parse(read("e2e/support/phase8-fixture-contract.json")) as {
      profiles: { ordinary: { flows: number; runs: number } };
    };

    expect(contract.profiles.ordinary.runs / contract.profiles.ordinary.flows).toBe(10);
    const fixture = createAutomationStudioLargeProjectFixture({
      projectId: "project.phase8-ordinary-contract",
      flowCount: contract.profiles.ordinary.flows,
      runsPerFlow: contract.profiles.ordinary.runs / contract.profiles.ordinary.flows,
    });
    expect(fixture.runDetails).toHaveLength(contract.profiles.ordinary.runs);
    for (const flow of fixture.flows) {
      const ownedRuns = fixture.runDetails.filter((detail) => detail.summary.flowId === flow.flowId);
      expect(ownedRuns).toHaveLength(10);
      expect(ownedRuns.every((detail) => detail.summary.projectId === "project.phase8-ordinary-contract")).toBe(true);
    }
  });
});
