// Inputs of the Automation Studio endpoints that list, create, read and
// change Flows. Each one is the payload its handler reads, and the tool input
// the panel assistant is shown; field descriptions are what a model reads.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";
import { HUMANNESS_MAX, HUMANNESS_MIN } from "../../../humanness/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow or Flows belong to.");
const flowId = z.string().trim().min(1).describe("The Flow.");

/** `list-flows`: every Flow in one project. */
export const listFlowsInput = programApiInput(z.object({ projectId }));

/** `create-flow`: a new, empty Flow in a project. */
export const createFlowInput = programApiInput(z.object({
  projectId,
  name: z.string().trim().min(1).max(200).optional().describe("The new Flow's name, in the person's words."),
  description: z.string().max(2000).optional().describe("What the Flow is for, in a sentence or two."),
  flowId: z.string().trim().min(1).optional().describe("A chosen id for the Flow; leave it out to have one made."),
  // The same bounds as `humannessSchema`, built here because these inputs are zod/v4 schemas.
  humanness: z.number().int().min(HUMANNESS_MIN).max(HUMANNESS_MAX).optional().describe("How human the Flow's input looks, a whole number from 0 to 100; leave it out for the Flow to use the person's starting value.")
}));

/** `get-flow`: one Flow, whole. */
export const getFlowInput = programApiInput(z.object({ projectId, flowId }));

/** `get-flow-metadata-detail`: a Flow's details and settings. */
export const getFlowMetadataDetailInput = programApiInput(z.object({ projectId, flowId }));

/** `update-flow-settings`: a Flow's name, description or visibility. */
export const updateFlowSettingsInput = programApiInput(z.object({
  projectId,
  flowId,
  flow: z.object({
    name: z.string().trim().min(1).max(200).optional().describe("The Flow's new name."),
    description: z.string().max(2000).optional().describe("What the Flow is for, in a sentence or two."),
    visibility: z.enum(["private", "public"]).optional().describe("Whether the Flow is private to its owner or public.")
  }).describe("The settings to change; leave out anything that stays as it is.")
}));

export type ListFlowsInput = ReturnType<typeof listFlowsInput.parse>;
export type CreateFlowInput = ReturnType<typeof createFlowInput.parse>;
export type GetFlowInput = ReturnType<typeof getFlowInput.parse>;
export type GetFlowMetadataDetailInput = ReturnType<typeof getFlowMetadataDetailInput.parse>;
export type UpdateFlowSettingsInput = ReturnType<typeof updateFlowSettingsInput.parse>;
