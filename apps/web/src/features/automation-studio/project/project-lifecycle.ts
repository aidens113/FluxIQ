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

export type AutomationProjectLifecycleLease = {
  current(): AutomationProjectLifecycle;
  dispose(): void;
};

export type AutomationProjectGenerationOwner = {
  advance(): number;
  current(): number;
  isCurrent(generation: number): boolean;
};

export function createAutomationProjectLifecycleLease(
  create: () => AutomationProjectLifecycle
): AutomationProjectLifecycleLease {
  let lifecycle: AutomationProjectLifecycle | null = null;
  return {
    current() {
      lifecycle ??= create();
      return lifecycle;
    },
    dispose() {
      lifecycle?.dispose();
      lifecycle = null;
    }
  };
}

export function createAutomationProjectLifecycle<Summary>(
  adapters: AutomationProjectLifecycleAdapters<Summary>,
  generationOwner: AutomationProjectGenerationOwner = createAutomationProjectGenerationOwner()
): AutomationProjectLifecycle {
  let projectId: string | null = null;
  let controller: AbortController | null = null;
  let disposed = false;

  const cancel = () => {
    generationOwner.advance();
    controller?.abort();
    controller = null;
  };

  return {
    activeProjectId: () => projectId,
    async open(nextProjectId) {
      if (disposed) return false;
      cancel();
      const requestGeneration = generationOwner.current();
      projectId = nextProjectId;
      controller = new AbortController();
      const signal = controller.signal;
      adapters.publishOpening(nextProjectId);
      try {
        const summary = await adapters.hydrate(nextProjectId, signal);
        if (disposed || signal.aborted || !generationOwner.isCurrent(requestGeneration) || projectId !== nextProjectId) return false;
        adapters.commit(nextProjectId, summary);
        return true;
      } catch (error) {
        if (disposed || signal.aborted || !generationOwner.isCurrent(requestGeneration) || projectId !== nextProjectId) return false;
        projectId = null;
        adapters.fail(nextProjectId, error);
        return false;
      } finally {
        if (generationOwner.isCurrent(requestGeneration)) controller = null;
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

function createAutomationProjectGenerationOwner(): AutomationProjectGenerationOwner {
  let generation = 0;
  return {
    advance: () => ++generation,
    current: () => generation,
    isCurrent: (candidate) => candidate === generation
  };
}
