export type AutomationProjectLifecycleAdapters<Summary> = {
  publishOpening(projectId: string): void;
  hydrate(projectId: string, signal: AbortSignal): Promise<Summary>;
  commit(projectId: string, summary: Summary): void;
  fail(projectId: string, error: unknown): void;
  clear(projectId: string | null): void;
};

export type AutomationProjectLifecycle = {
  activeProjectId(): string | null;
  open(projectId: string): Promise<boolean>;
  close(): void;
  dispose(): void;
};

export function createAutomationProjectLifecycle<Summary>(
  adapters: AutomationProjectLifecycleAdapters<Summary>
): AutomationProjectLifecycle {
  let projectId: string | null = null;
  let generation = 0;
  let controller: AbortController | null = null;
  let disposed = false;

  const cancel = () => {
    generation += 1;
    controller?.abort();
    controller = null;
  };

  return {
    activeProjectId: () => projectId,
    async open(nextProjectId) {
      if (disposed) return false;
      cancel();
      const requestGeneration = generation;
      projectId = nextProjectId;
      controller = new AbortController();
      const signal = controller.signal;
      adapters.publishOpening(nextProjectId);
      try {
        const summary = await adapters.hydrate(nextProjectId, signal);
        if (disposed || signal.aborted || requestGeneration !== generation || projectId !== nextProjectId) return false;
        adapters.commit(nextProjectId, summary);
        return true;
      } catch (error) {
        if (disposed || signal.aborted || requestGeneration !== generation || projectId !== nextProjectId) return false;
        projectId = null;
        adapters.fail(nextProjectId, error);
        return false;
      } finally {
        if (requestGeneration === generation) controller = null;
      }
    },
    close() {
      const closingProjectId = projectId;
      cancel();
      projectId = null;
      adapters.clear(closingProjectId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const closingProjectId = projectId;
      cancel();
      projectId = null;
      adapters.clear(closingProjectId);
    }
  };
}