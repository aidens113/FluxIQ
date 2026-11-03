import type { AutomationStudioSqlExecutor } from "../../sql/contracts/index.ts";
import type { AutomationStudioChangeFeedOperation } from "./change-feed-operation.ts";

export type AutomationStudioProjectMutationContext = {
  sql: AutomationStudioSqlExecutor;
  mutationId: string;
  changedAt: number;
  recordChange(input: { entityKind: string; entityId: string; parentId?: string | null; operation: AutomationStudioChangeFeedOperation; revision: number; hierarchyScope?: { kind: string; id?: string } | null }): Promise<number>;
  recordTouchedEntity(input: { entityKind: string; entityId: string; operation: AutomationStudioChangeFeedOperation; revision?: number | null }): Promise<void>;
};
