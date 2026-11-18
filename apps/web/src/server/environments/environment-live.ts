import type { EnvironmentStore } from "fluxiq/platform";

/**
 * Whether the environment is recorded as owned by this workspace and its
 * admitted intent is `running`: the one authority for its client's trust. A
 * stopped, deleted, missing or foreign environment trusts no client.
 */
export async function environmentLive(store: Pick<EnvironmentStore, "get">, workspaceId: string, environmentId: string): Promise<boolean> {
  const record = await store.get(environmentId);
  return record !== null && record.environmentId === environmentId && record.workspaceId === workspaceId && record.desired === "running";
}
