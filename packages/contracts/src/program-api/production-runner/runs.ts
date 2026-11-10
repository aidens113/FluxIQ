// Input of the Production Runner endpoint the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the production targets and their runs. Takes nothing. */
export const productionRunnerSnapshotInput = programApiInput(z.object({}));
