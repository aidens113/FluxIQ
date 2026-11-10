// Input of the Compute Control endpoint the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the connected hosts, their commands and leases. Takes nothing. */
export const computeControlSnapshotInput = programApiInput(z.object({}));
