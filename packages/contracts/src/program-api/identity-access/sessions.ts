// Input of the Identity and Access endpoint that ends a sign-in session.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `revoke-session`: signs one session out, by the digest the sessions list shows. */
export const revokeIdentitySessionInput = programApiInput(z.object({
  sessionDigest: z.string().trim().min(1).describe("The session to sign out, as the sessions list names it.")
}));
