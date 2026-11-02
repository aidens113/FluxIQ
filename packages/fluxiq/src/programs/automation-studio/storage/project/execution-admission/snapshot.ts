import type { ClientGatewayCommandRecord } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionAdmissionRows } from "./rows.ts";
import type { ExecutionAdmissionEvent } from "./event.ts";
export interface ExecutionAdmissionSnapshot {
    rows: {
        [K in keyof ExecutionAdmissionRows]: Map<string, ExecutionAdmissionRows[K]>;
    };
    events: Map<string, ExecutionAdmissionEvent>;
    commands: readonly ClientGatewayCommandRecord[];
    historicalUnknownCommandIds: readonly string[];
}
