// Input of the Deployment Sync endpoint the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the places the engine deploys to and what each holds. Takes nothing. */
export const deploymentSyncSnapshotInput = programApiInput(z.object({}));
