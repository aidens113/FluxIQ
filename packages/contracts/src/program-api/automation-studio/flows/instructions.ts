// Inputs of the Automation Studio endpoints for a Flow's instructions: the
// standing words a person gives a Flow about how it should work.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the instructions belong to.");
const flowId = z.string().trim().min(1).describe("The Flow.");
const scopeKind = z.enum(["global", "project", "flow", "node", "on_error"]).describe("Where the instruction applies: everywhere, one project, one Flow, one step, or when something goes wrong.");
const state = z.enum(["active", "disabled", "archived"]);
const requirement = z.enum(["required", "advisory"]);

/** `list-flow-instructions`: instructions, filtered. */
export const listFlowInstructionsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's instructions."),
  status: state.optional().describe("Only instructions in this state."),
  scopeKind: scopeKind.optional(),
  requirement: requirement.optional().describe("Only required or only advisory instructions."),
  search: z.string().max(200).optional().describe("Words to look for in the title or text."),
  sort: z.enum(["updated", "title", "status", "scope", "priority"]).optional().describe("What to order the list by."),
  direction: z.enum(["asc", "desc"]).optional().describe("Ascending or descending order."),
  limit: z.number().int().min(1).max(500).optional().describe("The most results to return."),
  offset: z.number().int().min(0).optional().describe("How many results to skip, for the next page.")
}));

/** `get-flow-instruction`: one instruction, whole. */
export const getFlowInstructionInput = programApiInput(z.object({
  projectId,
  instructionId: z.string().trim().min(1).describe("The instruction.")
}));

/** `get-flow-instruction-set`: every instruction that applies to a Flow. */
export const getFlowInstructionSetInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("The Flow; leave out for the project's own instructions.")
}));

/** `get-flow-instruction-readiness`: whether a Flow's instructions are enough to build or run it. */
export const getFlowInstructionReadinessInput = programApiInput(z.object({ projectId, flowId }));

/** `save-flow-instruction`: adds an instruction, or changes one that exists. */
export const saveFlowInstructionInput = programApiInput(z.object({
  projectId,
  flowId,
  title: z.string().trim().min(1).max(200).describe("A short title for the instruction."),
  body: z.string().trim().min(1).max(8000).describe("The instruction itself, in the person's words."),
  instructionId: z.string().trim().min(1).optional().describe("The instruction to change; leave out to add a new one."),
  scopeKind: scopeKind.optional().describe("Where it applies; the Flow itself when left out."),
  nodeId: z.string().trim().min(1).optional().describe("The step it applies to, when it applies to one step."),
  priority: z.number().min(0).max(100).optional().describe("How much it matters against other instructions; higher wins."),
  status: state.optional().describe("Whether it is in use."),
  requirement: requirement.optional().describe("Whether the Flow must follow it or may use judgement."),
  tags: z.array(z.enum(["generation", "runtime", "error", "router", "subflow", "review", "safety"])).optional().describe("Labels for when the instruction matters.")
}));

export type ListFlowInstructionsInput = ReturnType<typeof listFlowInstructionsInput.parse>;
export type GetFlowInstructionInput = ReturnType<typeof getFlowInstructionInput.parse>;
export type GetFlowInstructionSetInput = ReturnType<typeof getFlowInstructionSetInput.parse>;
export type GetFlowInstructionReadinessInput = ReturnType<typeof getFlowInstructionReadinessInput.parse>;
export type SaveFlowInstructionInput = ReturnType<typeof saveFlowInstructionInput.parse>;
