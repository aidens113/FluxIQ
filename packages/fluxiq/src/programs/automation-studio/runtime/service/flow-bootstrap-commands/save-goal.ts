import { randomUUID } from "node:crypto";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { stableJson } from "../index.ts";
import { requiredBootstrapCommandId } from "./field-readings.ts";

/** Canonical generation-goal persistence, retaining unchanged draft dependencies. */
export async function saveAutomationStudioFlowGenerationGoal(
  input: { projectId: string; flowId: string; instruction: string },
  owner: {
    assertTarget(projectId: string, flowId: string): Promise<unknown>;
    instructions(projectId: string, flowId: string): Promise<AutomationStudioFlowInstruction[]>;
    save(projectId: string, instruction: AutomationStudioFlowInstruction): Promise<AutomationStudioFlowInstruction>;
  }
): Promise<AutomationStudioFlowInstruction> {
    const projectId = requiredBootstrapCommandId(input.projectId, "project");
    const flowId = requiredBootstrapCommandId(input.flowId, "Flow");
    const body = typeof input.instruction === "string" ? input.instruction.trim() : "";
    if (!body || body.length > 4_000) throw new Error("Flow generation instruction must contain 1 to 4,000 characters.");
    await owner.assertTarget(projectId, flowId);
    const existing = (await owner.instructions(projectId, flowId)).find((item) => item.metadata?.source === "evidence_guided_generation");
    const now = Date.now();
    const instruction: AutomationStudioFlowInstruction = {
      schemaVersion: "0.1",
      instructionId: existing?.instructionId ?? `instruction.exploration.${randomUUID()}`,
      title: "Evidence-guided generation goal",
      body,
      scope: { kind: "flow", projectId, flowId },
      priority: 50,
      status: "active",
      requirement: "required",
      tags: ["generation"],
      linkedRunIds: existing?.linkedRunIds ?? [], linkedAdaptationIds: existing?.linkedAdaptationIds ?? [],
      linkedRecordingIds: existing?.linkedRecordingIds ?? [], linkedSubflowIds: existing?.linkedSubflowIds ?? [],
      createdAt: existing?.createdAt ?? now, updatedAt: now,
      metadata: { source: "evidence_guided_generation" }
    };
    // Supplying the same goal must preserve the saved draft's dependency digest.
    // Compare every effective field; disabled or changed goals still take the normal write path.
    if (existing && stableJson({ ...existing, updatedAt: now }) === stableJson(instruction)) return existing;
    return await owner.save(projectId, instruction);
}
