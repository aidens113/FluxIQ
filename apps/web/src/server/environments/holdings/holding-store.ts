import type { EnvironmentStore } from "fluxiq/platform";
import type { EnvironmentHoldings } from "./environment-holdings";

/**
 * The environment store the controller records through, settling each
 * admission's claim once the operation's intent is recorded or refused, so
 * the count passes from the claim to the stored record with no gap.
 */
export function holdingStore(store: EnvironmentStore, holdings: Pick<EnvironmentHoldings, "settle">): EnvironmentStore {
  return {
    get: (environmentId) => store.get(environmentId),
    listAll: () => store.listAll(),
    listByAccount: (accountId) => store.listByAccount(accountId),
    listByWorkspace: (workspaceId) => store.listByWorkspace(workspaceId),
    recordIntent: async (intent) => {
      try {
        return await store.recordIntent(intent);
      } finally {
        holdings.settle(intent.accountId, intent.environmentId);
      }
    },
    observe: (environmentId, operationId, observed) => store.observe(environmentId, operationId, observed),
    purge: (environmentId) => store.purge(environmentId)
  };
}
