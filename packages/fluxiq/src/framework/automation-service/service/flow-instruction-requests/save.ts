// What `save-flow-instruction` saves: a person's explicit instruction, keeping
// what an existing one under that ID already holds and the request does not name.

import type { SaveFlowInstructionRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioFlowInstruction, AutomationStudioInstructionTag } from "../../../../flows/authoring/model/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { flowInstructionScopeFromPayload } from "./scope.ts";

export async function saveFlowInstructionForRequest(
  service: Pick<AutomationStudioService, "getFlowInstruction" | "saveFlowInstruction">,
  input: { projectId: string; flowId: string; title: string; body: string; payload: SaveFlowInstructionRequest }
) {
  const { projectId, flowId, title, body, payload } = input;
  const now = Date.now();
  const existing = typeof payload.instructionId === "string" && payload.instructionId.trim()
    ? await service.getFlowInstruction(projectId, payload.instructionId.trim())
    : null;
  const instructionId = existing?.instructionId ?? payload.instructionId?.trim() ?? `instruction.${slugSegment(title)}.${now.toString(36)}`;
  const instruction: AutomationStudioFlowInstruction = {
    schemaVersion: "0.1",
    instructionId,
    title,
    body,
    scope: flowInstructionScopeFromPayload(projectId, flowId, payload),
    priority: Number.isFinite(Number(payload.priority)) ? Number(payload.priority) : existing?.priority ?? 50,
    status: payload.status === "disabled" || payload.status === "archived" ? payload.status : existing?.status ?? "active",
    requirement: payload.requirement === "required" ? "required" : "advisory",
    tags: Array.isArray(payload.tags) ? payload.tags.filter((tag): tag is AutomationStudioInstructionTag => typeof tag === "string" && ["generation", "runtime", "error", "router", "subflow", "review", "safety"].includes(tag)) : existing?.tags ?? [],
    linkedRunIds: existing?.linkedRunIds ?? [],
    linkedAdaptationIds: existing?.linkedAdaptationIds ?? [],
    linkedRecordingIds: existing?.linkedRecordingIds ?? [],
    linkedSubflowIds: existing?.linkedSubflowIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    metadata: { ...(existing?.metadata ?? {}), source: "explicit_instruction", inferred: false, generatedByModel: false }
  };
  return service.saveFlowInstruction(projectId, instruction);
}

function slugSegment(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "").slice(0, 48);
  return slug || "instruction";
}
