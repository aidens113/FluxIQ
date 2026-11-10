// Inputs of the Identity and Access endpoints the panel assistant may use. A
// password, PIN, authenticator code or role change is never one of them.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the people, roles and sign-in sessions. Takes nothing. */
export const identityAccessSnapshotInput = programApiInput(z.object({}));

/** `update-user`: renames a person. Their role and whether they can sign in are not offered. */
export const renameIdentityUserInput = programApiInput(z.object({
  id: z.string().trim().min(1).describe("The person to rename, as the people list names them."),
  username: z.string().trim().min(1).max(100).optional().describe("The new sign-in name. Leave it out to keep it."),
  displayName: z.string().trim().min(1).max(200).optional().describe("The new name shown to people. Leave it out to keep it.")
}));
