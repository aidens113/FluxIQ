import type { ClientGatewayCommandRecord } from "../../../../../client-gateway/service/command-ledger/index.ts";
export interface ExecutionCommandInventory {
    readonly records: readonly ClientGatewayCommandRecord[];
    readonly historicalUnknownCommandIds: readonly string[];
}
