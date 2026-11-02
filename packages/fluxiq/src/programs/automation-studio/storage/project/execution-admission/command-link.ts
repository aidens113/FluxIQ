import type { ClientGatewayCommandClaim } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { ExecutionEntry } from "../../../../../runtime/execution-admission/index.ts";
import type { AutomationStudioSqlExecutor } from "../database.ts";
import type { AutomationStudioProjectMutationContext } from "../unit-of-work.ts";
/** Trusted participant in the existing claim transaction; no nested claim or receipt owner. */
export interface ExecutionAdmissionCommandLink {
    readonly projectId: string;
    assertOriginal(originalEntry: ExecutionEntry): void;
    validate(sql: AutomationStudioSqlExecutor, originalEntry: ExecutionEntry, claim: ClientGatewayCommandClaim, required: boolean): Promise<void>;
    insert(context: AutomationStudioProjectMutationContext, originalEntry: ExecutionEntry, claim: ClientGatewayCommandClaim, required: boolean): Promise<string>;
    assertActive(originalEntry: ExecutionEntry): void;
}
