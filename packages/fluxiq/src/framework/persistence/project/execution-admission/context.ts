import type { AutomationStudioProjectDatabaseLease } from "../sql/index.ts";
import type { AutomationStudioProjectUnitOfWork } from "../mutations/index.ts";
import type { AutomationStudioProjectCommandLedgerStore } from "../command-ledger/index.ts";
export interface ExecutionAdmissionStorageContext {
    lease: AutomationStudioProjectDatabaseLease;
    unitOfWork: AutomationStudioProjectUnitOfWork;
    commands: AutomationStudioProjectCommandLedgerStore;
}
