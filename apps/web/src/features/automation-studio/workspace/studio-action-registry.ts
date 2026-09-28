export type AutomationStudioGraphActions = {
  active(): boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  save(authorizationPin: string): Promise<{ ok: boolean; message: string }>;
};

export type AutomationStudioRuntimeActions = {
  /**
   * Whether this run panel is the one the person is looking at. Graph actions
   * have always resolved this way; runtime actions resolved by "last
   * registered" instead, so with a Runtime Debug tab open per Flow - which the
   * object-scoped instance ids make routine - the header's Play and Stop drove
   * whichever panel mounted last rather than the visible one. A registrar that
   * does not report activity is treated as active, so a single mounted panel
   * still answers the header.
   */
  active?(): boolean;
  canPlay: boolean;
  canPause: boolean;
  canStop: boolean;
  play(): void;
  pause(): void;
  stop(): void;
};

type Snapshot = {
  revision: number;
  graph: Pick<AutomationStudioGraphActions, "canUndo" | "canRedo"> | null;
  runtime: Pick<AutomationStudioRuntimeActions, "canPlay" | "canPause" | "canStop"> | null;
};

const graphActions = new Map<string, AutomationStudioGraphActions>();
const runtimeActions = new Map<string, AutomationStudioRuntimeActions>();
const listeners = new Set<() => void>();
let snapshot: Snapshot = { revision: 0, graph: null, runtime: null };

export function registerAutomationStudioGraphActions(id: string, actions: AutomationStudioGraphActions): () => void {
  graphActions.set(id, actions);
  publish();
  return () => {
    graphActions.delete(id);
    publish();
  };
}

export function updateAutomationStudioGraphActions(id: string, actions: AutomationStudioGraphActions): void {
  graphActions.set(id, actions);
  publish();
}

export function registerAutomationStudioRuntimeActions(id: string, actions: AutomationStudioRuntimeActions): () => void {
  runtimeActions.set(id, actions);
  publish();
  return () => {
    runtimeActions.delete(id);
    publish();
  };
}

export function updateAutomationStudioRuntimeActions(id: string, actions: AutomationStudioRuntimeActions): void {
  runtimeActions.set(id, actions);
  publish();
}

export function invokeAutomationStudioGraphAction(action: "undo" | "redo"): void {
  activeGraphActions()?.[action]();
}

export function saveActiveAutomationStudioGraph(authorizationPin: string): Promise<{ ok: boolean; message: string }> | null {
  return activeGraphActions()?.save(authorizationPin) ?? null;
}

export function invokeAutomationStudioRuntimeAction(action: "play" | "pause" | "stop"): boolean {
  const runtime = activeRuntimeActions();
  if (!runtime) return false;
  const allowed = action === "play" ? runtime.canPlay : action === "pause" ? runtime.canPause : runtime.canStop;
  if (!allowed) return false;
  runtime[action]();
  return true;
}

export function automationStudioActionSnapshot(): Snapshot {
  return snapshot;
}

export function subscribeAutomationStudioActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetAutomationStudioActionsForTests(): void {
  graphActions.clear();
  runtimeActions.clear();
  publish();
}

function activeGraphActions(): AutomationStudioGraphActions | null {
  return [...graphActions.values()].reverse().find((actions) => actions.active()) ?? null;
}

function activeRuntimeActions(): AutomationStudioRuntimeActions | null {
  const newestFirst = [...runtimeActions.values()].reverse();
  return newestFirst.find((actions) => actions.active?.() === true)
    ?? newestFirst.find((actions) => !actions.active)
    ?? null;
}

function publish(): void {
  const graph = activeGraphActions();
  const runtime = activeRuntimeActions();
  snapshot = {
    revision: snapshot.revision + 1,
    graph: graph ? { canUndo: graph.canUndo, canRedo: graph.canRedo } : null,
    runtime: runtime ? { canPlay: runtime.canPlay, canPause: runtime.canPause, canStop: runtime.canStop } : null
  };
  for (const listener of listeners) listener();
}
