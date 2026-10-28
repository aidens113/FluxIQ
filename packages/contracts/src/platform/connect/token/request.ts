import { z } from "zod";
import { connectFieldSchemas } from "../fields.ts";

/**
 * The body of `POST /api/connect/token` (Flow A, step 6), sent as JSON. The
 * code is single use and bound to the challenge, install id, user, workspace
 * and approving session; `redirect_uri` and `client_install_id` must equal the
 * authorize request's. `grant_type` is OAuth's and always
 * `authorization_code`. Unknown fields are ignored.
 */
export const connectTokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: connectFieldSchemas.code,
  code_verifier: connectFieldSchemas.codeVerifier,
  redirect_uri: connectFieldSchemas.redirectUri,
  client_id: connectFieldSchemas.clientId,
  client_install_id: connectFieldSchemas.installId
});

export type ConnectTokenRequest = z.infer<typeof connectTokenRequestSchema>;
