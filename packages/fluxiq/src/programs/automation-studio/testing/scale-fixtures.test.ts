import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_SCALE_PROFILES,
  AUTOMATION_STUDIO_TARGET_SCALE,
  automationStudioScaleAssetBatch,
  automationStudioScaleGraphEdgeBatch,
  automationStudioScaleGraphNodeBatch,
  automationStudioScaleRuntimeEventBatch,
  createAutomationStudioScaleManifest
} from "./scale-fixtures.ts";

describe("Automation Studio scale fixtures", () => {
  it("reproduces identical graph entities from the same seed and absolute range", () => {
    const profile = AUTOMATION_STUDIO_SCALE_PROFILES.smoke;
    const whole = automationStudioScaleGraphNodeBatch(profile, "flow.scale", { count: 20, seed: 42 });
    const page = automationStudioScaleGraphNodeBatch(profile, "flow.scale", { start: 10, count: 5, seed: 42 });
    expect(page).toEqual(whole.slice(10, 15));
    expect(createAutomationStudioScaleManifest(profile, 42)).toEqual(createAutomationStudioScaleManifest(profile, 42));
  });

  it("generates bounded pages at target scale without allocating the target collection", () => {
    const nodes = automationStudioScaleGraphNodeBatch(AUTOMATION_STUDIO_TARGET_SCALE, "flow.target", { start: 99_990, count: 10 });
    const edges = automationStudioScaleGraphEdgeBatch(AUTOMATION_STUDIO_TARGET_SCALE, "flow.target", { start: 249_990, count: 10 });
    const events = automationStudioScaleRuntimeEventBatch(AUTOMATION_STUDIO_TARGET_SCALE, 9_999_999, { start: 999_990, count: 10 });
    const assets = automationStudioScaleAssetBatch(AUTOMATION_STUDIO_TARGET_SCALE, { start: 9_999_990, count: 10 });
    expect(nodes).toHaveLength(10);
    expect(edges).toHaveLength(10);
    expect(nodes.at(-1)?.nodeId).toBe("node.scale.0000099999");
    expect(edges.at(-1)?.edgeId).toBe("edge.scale.0000249999");
    expect(events.at(-1)?.sequence).toBe(999_999);
    expect(assets.every((asset) => asset.sha256.length === 64)).toBe(true);
  });

  it("caps accidental batches while allowing an explicit smaller cap", () => {
    expect(automationStudioScaleGraphNodeBatch(AUTOMATION_STUDIO_TARGET_SCALE, "flow.target", { count: 1_000_000 })).toHaveLength(10_000);
    expect(automationStudioScaleGraphNodeBatch(AUTOMATION_STUDIO_TARGET_SCALE, "flow.target", { count: 1_000, maxBatchSize: 25 })).toHaveLength(25);
  });
});
