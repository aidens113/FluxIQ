// Inputs of the Automation Studio endpoints that show and remove the browsers connected to FluxIQ.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

/** `client-gateway-snapshot`: how many browsers are connected, paired and trusted. */
export const clientGatewaySnapshotInput = programApiInput(z.object({}));

/** `list-client-gateway-items`: the connected browsers, the pairing requests or the trusted browsers. */
export const listClientGatewayItemsInput = programApiInput(z.object({
  kind: z.enum(["sessions", "pairings", "trustedClients"]).optional().describe("sessions for connected browsers, pairings for waiting requests, trustedClients for browsers that may stay connected; sessions when left out."),
  search: z.string().optional().describe("Only items whose details contain these words."),
  limit: z.number().int().min(1).max(200).optional().describe("The most items to return in one page."),
  cursor: z.string().optional().describe("The cursor a previous page gave for the next page.")
}));

/** `revoke-client-trust`: stop trusting a browser. */
export const revokeClientTrustInput = programApiInput(z.object({
  trustedClientId: z.string().trim().min(1).describe("The trusted browser to stop trusting."),
  reason: z.string().optional().describe("Why it is being removed.")
}));

export type ClientGatewaySnapshotInput = ReturnType<typeof clientGatewaySnapshotInput.parse>;
export type ListClientGatewayItemsInput = ReturnType<typeof listClientGatewayItemsInput.parse>;
export type RevokeClientTrustInput = ReturnType<typeof revokeClientTrustInput.parse>;
