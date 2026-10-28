import { z } from "zod";
import { connectFieldSchemas } from "./fields.ts";

/**
 * The query of `GET /connect/authorize` (Flow A, step 2). The page also checks
 * `redirect_uri` is `connectRedirectUri(<its own origin>)`. Unknown parameters
 * are ignored, as OAuth requires.
 */
export const connectAuthorizeRequestSchema = z.object({
  client_id: connectFieldSchemas.clientId,
  redirect_uri: connectFieldSchemas.redirectUri,
  code_challenge: connectFieldSchemas.codeChallenge,
  code_challenge_method: z.literal("S256"),
  state: connectFieldSchemas.state,
  client_install_id: connectFieldSchemas.installId,
  client_label: connectFieldSchemas.label
});

export type ConnectAuthorizeRequest = z.infer<typeof connectAuthorizeRequestSchema>;
