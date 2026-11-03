import type { AutomationStudioProjectDatabaseLease } from "../../../../../framework/persistence/project/sql/index.ts";
import type { AutomationStudioProjectUnitOfWork } from "../../../../../framework/persistence/project/mutations/index.ts";
import type { AutomationStudioProjectCommandLedgerStore } from "../command-ledger/index.ts";
export interface ExecutionAdmissionStorageContext {
    lease: AutomationStudioProjectDatabaseLease;
    unitOfWork: AutomationStudioProjectUnitOfWork;
    commands: AutomationStudioProjectCommandLedgerStore;
}
