// Inputs of the Automation Studio endpoints about building a Flow with a model.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");

/** `cancel-flow-bootstrap`: stops a Flow's build that is running. */
export const cancelFlowBootstrapInput = programApiInput(z.object({ projectId, flowId }));

/** `get-flow-bootstrap-failure`: why a Flow's latest build failed. */
export const getFlowBootstrapFailureInput = programApiInput(z.object({ projectId, flowId }));

/** `get-flow-bootstrap-generation-readiness`: whether a model is set up to build Flows. It takes no fields. */
export const getFlowBootstrapGenerationReadinessInput = programApiInput(z.object({}));

export type CancelFlowBootstrapInput = ReturnType<typeof cancelFlowBootstrapInput.parse>;
export type GetFlowBootstrapFailureInput = ReturnType<typeof getFlowBootstrapFailureInput.parse>;
export type GetFlowBootstrapGenerationReadinessInput = ReturnType<typeof getFlowBootstrapGenerationReadinessInput.parse>;
