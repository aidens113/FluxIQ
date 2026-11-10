// Inputs of the Runtime endpoints the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the engine's status, clients and runs. Takes nothing. */
export const runtimeSnapshotInput = programApiInput(z.object({}));

/** `list-clients`: the clients connected to the engine. Takes nothing. */
export const listRuntimeClientsInput = programApiInput(z.object({}));

/** `list-capabilities`: what the engine can do. Takes nothing. */
export const listRuntimeCapabilitiesInput = programApiInput(z.object({}));

/** `list-runs`: the runs the engine knows of. Takes nothing. */
export const listRuntimeRunsInput = programApiInput(z.object({}));

/** `get-run`: one engine run. */
export const getRuntimeRunInput = programApiInput(z.object({
  runId: z.string().trim().min(1).describe("The run to look at, as the runs list names it.")
}));
