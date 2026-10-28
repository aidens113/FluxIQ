import { z } from "zod";

/**
 * The body of `POST /api/connect/revoke`, sent as JSON: a client revoking its
 * own credential (RFC 7009 shape). Core answers 200 with `{}` whether or not
 * the credential was valid, so the call reveals nothing.
 */
export const connectRevokeRequestSchema = z.object({
  token: z.string().min(1).max(512)
});

export type ConnectRevokeRequest = z.infer<typeof connectRevokeRequestSchema>;
