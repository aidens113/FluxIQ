// Input of the Secret Keys endpoint that lists the person's model keys. A key's value is never part of the answer.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the model keys, which is the default, and whether they are unlocked. Takes nothing. */
export const secretKeysSnapshotInput = programApiInput(z.object({}));
