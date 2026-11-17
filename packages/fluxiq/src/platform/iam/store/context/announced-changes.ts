/** Told the workspace (null for the platform level) whose IAM store a write just changed. */
export type IamStoreChangeListener = (workspaceId: string | null) => void;

const listeners = new Set<IamStoreChangeListener>();

/**
 * Every successful write to any `IamStore` in this process, announced by the
 * store scope beside the `iam-change` audit record it writes for it
 * (`./store-scope.ts`). A decision made from a principal's policies stays
 * right until one of these names its workspace, so a holder of decisions (the
 * client gateway's activity delivery, through the program registry) reuses
 * them until then instead of asking again.
 *
 * Process-wide, as the activity hub is: a host composes its IAM stores out of
 * reach of the program runtimes that decide by them (the web host hands a
 * runtime only a policy source over a store it opens later), so the store
 * itself is where the change is known. A listener left behind keeps its owner
 * reachable, so an owner that closes removes it. A write made by another
 * process is not announced here.
 */
export const iamStoreChanges = Object.freeze({
  /** Adds a listener; the returned function removes it. */
  subscribe(listener: IamStoreChangeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Tells every listener; one that throws loses only its own notice. */
  announce(workspaceId: string | null): void {
    for (const listener of [...listeners]) {
      try {
        listener(workspaceId);
      } catch (error) {
        console.error("An IAM change listener failed.", error);
      }
    }
  }
});
