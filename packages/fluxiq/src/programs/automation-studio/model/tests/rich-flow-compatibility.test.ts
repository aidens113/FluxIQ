import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../flows/authoring/flow/index.ts";
import { createPublishedFlowSnapshot } from "../../../../flows/authoring/publication/index.ts";
import { createBlankAutomationStudioFlow } from "../../../../flows/authoring/legacy-artifact/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY, defaultAutomationStudioFlowSettingsMetadata } from "../../../../flows/authoring/settings/index.ts";
import * as legacyFlows from "../flows.ts";
import * as legacyComposites from "../composites.ts";
import * as legacyArtifacts from "../artifacts.ts";
import * as legacySize from "../flow-size/index.ts";
import * as legacyTokens from "../tokens-per-run/index.ts";

describe("authored Flow compatibility", () => {
  it("preserves function and setting identity through old imports", () => {
    expect(legacyFlows.createBlankAutomationStudioFlowArtifact).toBe(createBlankAutomationStudioFlowArtifact);
    expect(legacyFlows.defaultAutomationStudioFlowSettingsMetadata).toBe(defaultAutomationStudioFlowSettingsMetadata);
    expect(legacyComposites.createPublishedFlowSnapshot).toBe(createPublishedFlowSnapshot);
    expect(legacyArtifacts.createBlankAutomationStudioFlow).toBe(createBlankAutomationStudioFlow);
    expect(legacySize.AUTOMATION_STUDIO_FLOW_SIZE_SETTING).toBe(AUTOMATION_STUDIO_FLOW_SIZE_SETTING);
    expect(legacyTokens.AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY).toBe(AUTOMATION_STUDIO_TOKENS_PER_RUN_DEFAULT_CLEARED_KEY);
  });

  it("creates the complete legacy owner-bound document without changing metadata", () => {
    const metadata = { retained: "value" };
    const input = { flowId: "flow.legacy", ownerKind: "task" as const, ownerId: "task.legacy", name: "Legacy", description: "Retained", now: 42, metadata };
    const flow = createBlankAutomationStudioFlow(input);
    expect(flow).toEqual({ schemaVersion: "0.1", flowId: input.flowId, ownerKind: "task", ownerId: input.ownerId, name: "Legacy", description: "Retained", nodes: [], edges: [], createdAt: 42, updatedAt: 42, metadata });
    expect(flow.metadata).toBe(metadata);
    expect(createBlankAutomationStudioFlow({ flowId: input.flowId, ownerKind: input.ownerKind, ownerId: input.ownerId, name: input.name, now: input.now })).not.toHaveProperty("metadata");
  });
});

