import type { ClientGatewayCommandContext, ClientGatewayCommandLedgerLease } from "../../../../../client-gateway/service/command-ledger/index.ts";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../storage/project/index.ts";

export type AutomationStudioCommandContextOwner = { projectId: string; runId: string; flowId: string; invocationId: string; attemptId: string; effectOrdinal: number };
export type AutomationStudioCommandContextPorts = { pool?: AutomationStudioProjectDatabasePool; getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> };
export type AutomationStudioCommandContextLease = ClientGatewayCommandLedgerLease & { context: ClientGatewayCommandContext };
