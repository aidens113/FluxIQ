import type { PlatformStore } from "fluxiq/platform";

/** Platform identity plus current workspace membership, checked again on every key use. */
export async function workspaceAccountEligible(input: {
  userId: string;
  workspaceId: string;
  tenancy: "single" | "multi";
  primaryWorkspaceId: string;
  enabledUser: (userId: string) => Promise<boolean>;
  store: Pick<PlatformStore, "getAccount" | "getWorkspace" | "getMembership">;
}): Promise<boolean> {
  if (!await input.enabledUser(input.userId)) return false;
  if (input.tenancy === "single") return input.workspaceId === input.primaryWorkspaceId;
  if (input.workspaceId === input.primaryWorkspaceId) return false;
  const account = await input.store.getAccount(input.userId);
  if (!account || account.status !== "active" || account.deletion !== null) return false;
  const workspace = await input.store.getWorkspace(input.workspaceId);
  if (!workspace) return false;
  const membership = await input.store.getMembership(input.workspaceId, input.userId);
  return membership?.status === "active";
}
