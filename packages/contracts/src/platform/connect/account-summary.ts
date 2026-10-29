import { z } from "zod";

/**
 * Who a connected client acts as, as the token response and the gateway's
 * `server.session_ready` (0.2) tell the client: the user, for display only.
 */
export const connectUserSummarySchema = z.object({
  userId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(100),
  email: z.string().email().max(254)
});

export type ConnectUserSummary = z.infer<typeof connectUserSummarySchema>;

/** The workspace a connected client is bound to, for display only. */
export const connectWorkspaceSummarySchema = z.object({
  workspaceId: z.string().min(1).max(128),
  name: z.string().min(1).max(100)
});

export type ConnectWorkspaceSummary = z.infer<typeof connectWorkspaceSummarySchema>;
