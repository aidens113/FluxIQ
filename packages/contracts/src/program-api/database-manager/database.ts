// Input of the Database Manager endpoint the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: which stores the engine keeps and how many records each holds. Takes nothing. */
export const databaseManagerSnapshotInput = programApiInput(z.object({}));
