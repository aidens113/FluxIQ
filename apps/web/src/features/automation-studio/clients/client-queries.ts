import type { ClientGatewaySnapshot } from "./client-model";
import type { ClientGatewayApi } from "./client-api-types";

export function queryClientGatewaySnapshot(api: ClientGatewayApi) {
  return api.get<ClientGatewaySnapshot>("client-gateway-snapshot");
}

export function listClientGatewayItems(api: ClientGatewayApi, input: { kind: "sessions" | "pairings" | "trustedClients"; limit: number; cursor?: string | null; search?: string }) {
  return api.post<{ items?: any[]; page?: { total?: number; limit?: number; nextCursor?: string | null; hasMore?: boolean } }>("list-client-gateway-items", input);
}
