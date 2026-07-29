import { describe, expect, it } from "vitest";
import { createAutomationStudioFixture } from "../model";
import {
  canonicalArtifactIdentity,
  createCanonicalAutomationStudioMemoryRepositories,
  learnedTaskModelDocumentId,
  normalizedTimelineDocumentId,
  policyGraphDocumentId,
  recordingSessionDocumentId,
  signalRegistryDocumentId
} from "./index";

describe("automation studio canonical storage", () => {
  it("derives stable document IDs for canonical artifacts", () => {
    const fixture = createAutomationStudioFixture();

    expect(recordingSessionDocumentId(fixture.recording)).toBe("recording.demo-open-and-confirm");
    expect(normalizedTimelineDocumentId(fixture.normalizedTimeline)).toBe("timeline.demo-open-and-confirm.normalized");
    expect(signalRegistryDocumentId(fixture.signalRegistry)).toBe("registry.demo");
    expect(learnedTaskModelDocumentId(fixture.learnedTaskModel)).toBe("model.demo-confirm.0-1-0");
    expect(policyGraphDocumentId(fixture.policy)).toBe("policy.demo-confirm");
  });

  it("stores, lists, retrieves, and deletes every canonical artifact kind", async () => {
    const repositories = createCanonicalAutomationStudioMemoryRepositories();
    const fixture = createAutomationStudioFixture();

    await repositories.recordingSessions.put(fixture.recording);
    await repositories.normalizedTimelines.put(fixture.normalizedTimeline);
    await repositories.signalRegistries.put(fixture.signalRegistry);
    await repositories.learnedTaskModels.put(fixture.learnedTaskModel);
    await repositories.policyGraphs.put(fixture.policy);

    expect(await repositories.recordingSessions.list()).toHaveLength(1);
    expect(await repositories.normalizedTimelines.get(fixture.normalizedTimeline.normalizedTimelineId)).toMatchObject({
      recordingId: fixture.recording.recordingId
    });
    expect(await repositories.signalRegistries.get(fixture.signalRegistry.registryId)).toMatchObject({
      definitions: expect.arrayContaining([expect.objectContaining({ path: "app.dialog.visible" })])
    });
    expect(await repositories.learnedTaskModels.get(fixture.learnedTaskModel.learnedTaskModelId)).toMatchObject({
      taskId: fixture.recording.taskId
    });
    expect(await repositories.policyGraphs.get(fixture.policy.policyId)).toMatchObject({
      taskId: fixture.recording.taskId
    });

    expect(await repositories.policyGraphs.delete(fixture.policy.policyId)).toBe(true);
    expect(await repositories.policyGraphs.get(fixture.policy.policyId)).toBeNull();
    expect(await repositories.policyGraphs.delete(fixture.policy.policyId)).toBe(false);
  });

  it("filters canonical artifacts by domain scope", async () => {
    const repositories = createCanonicalAutomationStudioMemoryRepositories();
    const base = createAutomationStudioFixture();
    const scoped = createAutomationStudioFixture(20_000);
    scoped.recording.recordingId = "recording.scoped";
    scoped.recording.environment.domainId = "example";
    scoped.normalizedTimeline.normalizedTimelineId = "timeline.scoped";
    scoped.normalizedTimeline.recordingId = scoped.recording.recordingId;
    scoped.normalizedTimeline.metadata = { domainId: "example" };
    scoped.signalRegistry.registryId = "registry.scoped";
    scoped.signalRegistry.metadata = { domainId: "example" };
    scoped.learnedTaskModel.learnedTaskModelId = "model.scoped";
    scoped.learnedTaskModel.metadata = { domainId: "example" };
    scoped.policy.policyId = "policy.scoped";
    scoped.policy.metadata = { domainId: "example" };

    await repositories.recordingSessions.put(base.recording);
    await repositories.recordingSessions.put(scoped.recording);
    await repositories.normalizedTimelines.put(base.normalizedTimeline);
    await repositories.normalizedTimelines.put(scoped.normalizedTimeline);
    await repositories.signalRegistries.put(base.signalRegistry);
    await repositories.signalRegistries.put(scoped.signalRegistry);
    await repositories.learnedTaskModels.put(base.learnedTaskModel);
    await repositories.learnedTaskModels.put(scoped.learnedTaskModel);
    await repositories.policyGraphs.put(base.policy);
    await repositories.policyGraphs.put(scoped.policy);

    expect((await repositories.recordingSessions.list(null)).map((item) => item.recordingId)).toEqual([base.recording.recordingId]);
    expect((await repositories.recordingSessions.list("example")).map((item) => item.recordingId)).toEqual(["recording.scoped"]);
    expect((await repositories.normalizedTimelines.list("example")).map((item) => item.normalizedTimelineId)).toEqual(["timeline.scoped"]);
    expect((await repositories.signalRegistries.list("example")).map((item) => item.registryId)).toEqual(["registry.scoped"]);
    expect((await repositories.learnedTaskModels.list("example")).map((item) => item.learnedTaskModelId)).toEqual(["model.scoped"]);
    expect((await repositories.policyGraphs.list("example")).map((item) => item.policyId)).toEqual(["policy.scoped"]);
  });

  it("returns cloned documents so callers cannot mutate repository state accidentally", async () => {
    const repositories = createCanonicalAutomationStudioMemoryRepositories();
    const fixture = createAutomationStudioFixture();

    await repositories.recordingSessions.put(fixture.recording);
    const retrieved = await repositories.recordingSessions.get(fixture.recording.recordingId);
    expect(retrieved).not.toBeNull();
    retrieved!.timeline.length = 0;

    expect((await repositories.recordingSessions.get(fixture.recording.recordingId))?.timeline).toHaveLength(fixture.recording.timeline.length);
  });

  it("exposes kind, id, domain, and task identity for canonical artifacts", () => {
    const fixture = createAutomationStudioFixture();

    expect(canonicalArtifactIdentity(fixture.recording)).toEqual({
      kind: "recording_session",
      id: fixture.recording.recordingId,
      domainId: null,
      taskId: fixture.recording.taskId
    });
    expect(canonicalArtifactIdentity(fixture.policy)).toMatchObject({
      kind: "policy_graph",
      id: fixture.policy.policyId,
      taskId: fixture.policy.taskId
    });
  });
});
