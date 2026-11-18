/** Told the id of a project the catalogue no longer lists, once its removal succeeded. */
export type AutomationStudioProjectRemovalListener = (projectId: string) => void;

/**
 * Announces each project the service removed from its catalogue, after the
 * removal succeeded (`AutomationStudioService.deleteProject` runs its removal
 * inside `run`). Whoever holds something decided from the project being there
 * (the client gateway's activity delivery, which reuses a paired person's
 * access to a project until it may have changed) is told when it stops being
 * there, rather than finding out at its next question. A removal that failed
 * is not announced: the project is still listed.
 */
export class AutomationStudioProjectRemovals {
  private readonly listeners = new Set<AutomationStudioProjectRemovalListener>();

  /** Adds a listener; the returned function removes it. */
  subscribe(listener: AutomationStudioProjectRemovalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Runs `removal` of `projectId` and, once it succeeded, tells every listener. */
  async run<T>(projectId: string, removal: () => Promise<T>): Promise<T> {
    const removed = await removal();
    for (const listener of [...this.listeners]) {
      try {
        listener(projectId);
      } catch (error) {
        console.error("A project removal listener failed.", error);
      }
    }
    return removed;
  }
}
