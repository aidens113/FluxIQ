// Inputs of the Automation Studio endpoints that show the changes a Flow has
// proposed to its own instructions.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");

/** `list-flow-change-proposals`: the changes proposed for a project's Flows. */
export const listFlowChangeProposalsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's proposals."),
  limit: z.number().int().min(1).max(500).optional().describe("The most results to return."),
  offset: z.number().int().min(0).optional().describe("How many results to skip, for the next page.")
}));

/** `get-flow-change-proposal`: one proposed change, whole. */
export const getFlowChangeProposalInput = programApiInput(z.object({
  projectId,
  flowId,
  proposalId: z.string().trim().min(1).describe("The proposed change.")
}));

export type ListFlowChangeProposalsInput = ReturnType<typeof listFlowChangeProposalsInput.parse>;
export type GetFlowChangeProposalInput = ReturnType<typeof getFlowChangeProposalInput.parse>;
