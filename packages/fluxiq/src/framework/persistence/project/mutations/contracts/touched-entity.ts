import type { AutomationStudioChangeFeedOperation } from "./change-feed-operation.ts";

export type AutomationStudioMutationTouchedEntity = {
  mutationId: string;
  entityKind: string;
  entityId: string;
  operation: AutomationStudioChangeFeedOperation;
  revision: number | null;
};
