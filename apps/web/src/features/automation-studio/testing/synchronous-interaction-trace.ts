export type AutomationStudioSynchronousTraceKind =
  | "interaction-start"
  | "store-commit"
  | "render-commit"
  | "interaction-end";

export type AutomationStudioSynchronousTraceEvent = Readonly<{
  sequence: number;
  kind: AutomationStudioSynchronousTraceKind;
  owner: string;
  detail?: string;
}>;

export type AutomationStudioSynchronousTraceSummary = Readonly<{
  events: readonly AutomationStudioSynchronousTraceEvent[];
  storeCommits: Readonly<Record<string, number>>;
  renderCommits: Readonly<Record<string, number>>;
  duplicateStoreOwners: readonly string[];
  totalStoreCommits: number;
  totalRenderCommits: number;
}>;

export type AutomationStudioSynchronousTrace = ReturnType<typeof createAutomationStudioSynchronousTrace>;

export function createAutomationStudioSynchronousTrace() {
  const events: AutomationStudioSynchronousTraceEvent[] = [];
  let activeInteraction: string | null = null;

  const record = (kind: AutomationStudioSynchronousTraceKind, owner: string, detail?: string) => {
    events.push(Object.freeze({
      sequence: events.length + 1,
      kind,
      owner,
      ...(detail === undefined ? {} : { detail }),
    }));
  };

  return {
    interaction<T>(owner: string, run: () => T): T {
      if (activeInteraction) throw new Error(`Interaction ${activeInteraction} is already being traced.`);
      activeInteraction = owner;
      record("interaction-start", owner);
      try {
        return run();
      } finally {
        record("interaction-end", owner);
        activeInteraction = null;
      }
    },
    storeCommit(owner: string, detail?: string): void {
      record("store-commit", owner, detail);
    },
    renderCommit(owner: string, detail?: string): void {
      record("render-commit", owner, detail);
    },
    storeSubscriber(owner: string, renderOwners: readonly string[] = []): () => void {
      return () => {
        record("store-commit", owner);
        for (const renderOwner of renderOwners) {
          record("render-commit", renderOwner, `notified-by:${owner}`);
        }
      };
    },
    renderProbe(owner: string): (detail?: string) => void {
      return (detail) => record("render-commit", owner, detail);
    },
    events(): readonly AutomationStudioSynchronousTraceEvent[] {
      return events.map((event) => ({ ...event }));
    },
    summary(): AutomationStudioSynchronousTraceSummary {
      const storeCommits = countOwners(events, "store-commit");
      const renderCommits = countOwners(events, "render-commit");
      return Object.freeze({
        events: events.map((event) => ({ ...event })),
        storeCommits: Object.freeze(storeCommits),
        renderCommits: Object.freeze(renderCommits),
        duplicateStoreOwners: Object.freeze(
          Object.entries(storeCommits)
            .filter(([, count]) => count > 1)
            .map(([owner]) => owner)
            .sort(),
        ),
        totalStoreCommits: sumCounts(storeCommits),
        totalRenderCommits: sumCounts(renderCommits),
      });
    },
    reset(): void {
      if (activeInteraction) throw new Error(`Cannot reset while interaction ${activeInteraction} is active.`);
      events.length = 0;
    },
  };
}

function countOwners(
  events: readonly AutomationStudioSynchronousTraceEvent[],
  kind: AutomationStudioSynchronousTraceKind,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.kind === kind) counts[event.owner] = (counts[event.owner] ?? 0) + 1;
  }
  return counts;
}

function sumCounts(counts: Readonly<Record<string, number>>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
