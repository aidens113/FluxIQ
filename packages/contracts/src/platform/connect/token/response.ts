import { z } from "zod";
import { isSecureOrLoopbackUrl } from "../../url/index.ts";
import { connectUserSummarySchema, connectWorkspaceSummarySchema } from "../account-summary.ts";

/**
 * The success body of `POST /api/connect/token` (Flow A, step 7). The client
 * stores `credential` and connects with `client.hello.token = credential`.
 *
 * - `credential`: opaque, at least 32 characters; Core keeps only its hash;
 * - `credentialExpiresAt`: epoch milliseconds; the credential slides on every
 *   connect, and `server.session_ready` (0.2) gives the rotated one;
 * - `connectedClientId`: the connected client's id (`gateway:browser/<id>` in
 *   IAM); the plan's "connected browser id", named for the gateway's generic
 *   client vocabulary;
 * - `gatewayUrl`: as discovery gives it.
 *
 * Unknown fields are dropped.
 */
export const connectTokenResponseSchema = z.object({
  credential: z.string().min(32).max(512),
  credentialExpiresAt: z.number().int().positive(),
  connectedClientId: z.string().min(1).max(128),
  user: connectUserSummarySchema,
  workspace: connectWorkspaceSummarySchema,
  gatewayUrl: z.string().refine((value) => isSecureOrLoopbackUrl(value, "ws"), "a wss URL, or ws on loopback")
});

export type ConnectTokenResponse = z.infer<typeof connectTokenResponseSchema>;
