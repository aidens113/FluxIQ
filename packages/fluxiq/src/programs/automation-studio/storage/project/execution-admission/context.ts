import type { AutomationStudioProjectDatabaseLease } from "../database.ts";
import type { AutomationStudioProjectUnitOfWork } from "../unit-of-work.ts";
import type { AutomationStudioProjectCommandLedgerStore } from "../command-ledger/index.ts";
export interface ExecutionAdmissionStorageContext {
    lease: AutomationStudioProjectDatabaseLease;
    unitOfWork: AutomationStudioProjectUnitOfWork;
    commands: AutomationStudioProjectCommandLedgerStore;
}
