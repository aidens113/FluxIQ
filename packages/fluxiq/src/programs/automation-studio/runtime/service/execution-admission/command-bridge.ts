import type { ClientGatewayCommandClaim, ClientGatewayCommandContext, ClientGatewayCommandOutcomeObserver } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { AutomationStudioProjectCommandLedgerStore, AutomationStudioCommandRunAdmission } from "../../../../../framework/persistence/project/command-ledger/index.ts";
/** Additive hooks in the sole required observer/claim/handling owner. */
export interface AutomationStudioExecutionCommandBridge {
    claim(context: ClientGatewayCommandContext, store: AutomationStudioProjectCommandLedgerStore, claim: ClientGatewayCommandClaim, admission: AutomationStudioCommandRunAdmission): ReturnType<AutomationStudioProjectCommandLedgerStore["claimForRun"]> | undefined;
    completed(context: ClientGatewayCommandContext, observer: ClientGatewayCommandOutcomeObserver, originalProof: object): Promise<void>;
    uncertain(context: ClientGatewayCommandContext, withdrawn: boolean): Promise<void>;
    consumed(context: ClientGatewayCommandContext, originalProof: object): Promise<void>;
}
