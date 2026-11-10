// Input of the Secret Keys endpoint that picks the default model key. A key's
// value is never part of it.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `set-default-key`: makes one enabled model key the default. */
export const setDefaultKeyInput = programApiInput(z.object({
  id: z.string().trim().min(1).describe("The key to make the default. It must be turned on.")
}));

export type SetDefaultKeyInput = ReturnType<typeof setDefaultKeyInput.parse>;
