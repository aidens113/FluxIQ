// Inputs of the Automation Studio endpoints for a Flow's life after it is
// written: deleting it, publishing versions, and what depends on it.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");
const version = z.string().trim().min(1).max(64).describe("The published version, such as 1.2.0.");

/** `delete-flow`: removes a Flow. */
export const deleteFlowInput = programApiInput(z.object({ projectId, flowId }));

/** `publish-flow`: publishes the Flow as a named version. */
export const publishFlowInput = programApiInput(z.object({
  projectId,
  flowId,
  version,
  changelog: z.string().max(2000).optional().describe("What changed in this version, in a sentence or two.")
}));

/** `list-flow-publications`: the versions a Flow was published as. */
export const listFlowPublicationsInput = programApiInput(z.object({
  projectId,
  flowId: flowId.optional().describe("Only this Flow's versions; leave out for every Flow in the project.")
}));

/** `deprecate-flow-publication`: marks a published version as no longer to be used. */
export const deprecateFlowPublicationInput = programApiInput(z.object({
  projectId,
  flowId,
  version,
  reason: z.string().max(1000).optional().describe("Why the version should no longer be used.")
}));

/** `inspect-flow-dependencies`: what a Flow uses and what uses it. */
export const inspectFlowDependenciesInput = programApiInput(z.object({ projectId, flowId }));

export type DeleteFlowInput = ReturnType<typeof deleteFlowInput.parse>;
export type PublishFlowInput = ReturnType<typeof publishFlowInput.parse>;
export type ListFlowPublicationsInput = ReturnType<typeof listFlowPublicationsInput.parse>;
export type DeprecateFlowPublicationInput = ReturnType<typeof deprecateFlowPublicationInput.parse>;
export type InspectFlowDependenciesInput = ReturnType<typeof inspectFlowDependenciesInput.parse>;
