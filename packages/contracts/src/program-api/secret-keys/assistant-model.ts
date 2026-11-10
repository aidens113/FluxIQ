// Inputs of the Secret Keys endpoints that read and set which key and model the
// panel assistant uses. A key's value is never part of them.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `get-assistant-model`: which key and model the assistant uses now. Takes nothing. */
export const getAssistantModelInput = programApiInput(z.object({}));

/** `set-assistant-model`: the key and model the assistant uses. */
export const setAssistantModelInput = programApiInput(z.object({
  keyId: z.string().trim().min(1).optional().describe("The key the assistant should use. Leave it out to use the default key. It must be turned on."),
  model: z.string().trim().min(1).max(200).optional().describe("The model to use with that key's provider. Leave it out to use the provider's normal model.")
}));

export type SetAssistantModelInput = ReturnType<typeof setAssistantModelInput.parse>;
