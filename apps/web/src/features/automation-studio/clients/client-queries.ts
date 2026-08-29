import type { ClientGatewaySnapshot } from "./client-model";
import type { ClientGatewayApi } from "./client-api-types";

export function queryClientGatewaySnapshot(api: ClientGatewayApi) {
  return api.get<ClientGatewaySnapshot>("client-gateway-snapshot");
}