import type { ClientGatewayCommandContext } from "../../../../../client-gateway/service/command-ledger/index.ts";
/** Only the existing handling controller can mint this original post-consumption witness. */
export interface AutomationStudioExecutionConsumptionReader {
    read(originalProof: object, context: ClientGatewayCommandContext): {
        readonly handlingDigest: string;
    } | null;
}
