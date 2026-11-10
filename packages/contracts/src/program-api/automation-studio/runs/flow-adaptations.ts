// Inputs of the Automation Studio endpoints for the changes a run proposed to
// its Flow (adaptations): listing, reading and reviewing them.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");
const adaptationId = z.string().trim().min(1).describe("The proposed change.");

/** `list-flow-adaptations`: a page of the changes proposed to Flows. */
export const listFlowAdaptationsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's proposed changes; leave out for every Flow in the project."),
  subflowId: z.string().trim().min(1).optional().describe("Only changes to this part of a Flow."),
  status: z.string().trim().min(1).optional().describe("Only changes in this state, such as pending or approved."),
  risk: z.string().trim().min(1).optional().describe("Only changes with this risk level."),
  search: z.string().trim().min(1).optional().describe("Only changes whose details contain these words."),
  sort: z.enum(["updated", "status", "risk", "trigger"]).optional().describe("What to order the changes by."),
  direction: z.enum(["asc", "desc"]).optional().describe("Ascending or descending order."),
  limit: z.number().int().min(1).max(200).optional().describe("The most changes to return in one page."),
  offset: z.number().int().min(0).optional().describe("How many changes to skip, for the next page.")
}));

/** `get-flow-adaptation`: one proposed change. */
export const getFlowAdaptationInput = programApiInput(z.object({ projectId, flowId, adaptationId }));

/** `review-flow-adaptation`: approves, rejects or otherwise settles a proposed change. */
export const reviewFlowAdaptationInput = programApiInput(z.object({
  projectId,
  flowId,
  adaptationId,
  action: z.enum(["approve", "reject", "apply", "disable", "revert", "supersede", "request_validation", "switch_manual"]).describe("What to do with the change."),
  reason: z.string().max(1000).optional().describe("Why, in a sentence or two."),
  supersededByAdaptationId: z.string().trim().min(1).optional().describe("For supersede: the change that replaces this one.")
}));

export type ListFlowAdaptationsInput = ReturnType<typeof listFlowAdaptationsInput.parse>;
export type GetFlowAdaptationInput = ReturnType<typeof getFlowAdaptationInput.parse>;
export type ReviewFlowAdaptationInput = ReturnType<typeof reviewFlowAdaptationInput.parse>;
