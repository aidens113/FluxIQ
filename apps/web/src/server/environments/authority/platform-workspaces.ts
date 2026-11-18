import type { PlatformStore } from "fluxiq/platform";

/**
 * The platform store's workspace reads, loaded on first use: the provisioning
 * composition imports the commerce composition, so it is reached with a
 * dynamic `import()` to keep the two out of a load cycle.
 */
export const platformWorkspaces: Pick<PlatformStore, "getWorkspace"> = {
  getWorkspace: async (workspaceId) => {
    const { getPlatformServices } = await import("../../provisioning-listener");
    return (await getPlatformServices()).store.getWorkspace(workspaceId);
  }
};
