export type AutomationStudioMutation =
  | {
      kind: "subflow.changed";
      projectId: string | null;
      flowId: string;
      subflowId?: string;
    }
  | {
      kind: "flow-settings.changed";
      projectId: string | null;
      flowId: string;
    }
  | {
      kind: "instruction.changed";
      projectId: string | null;
      flowId: string;
      instructionId: string;
    }
  | {
      kind: "router.changed";
      projectId: string | null;
      flowId: string;
    }
  | {
      kind: "runtime-run.changed";
      projectId: string | null;
      flowId?: string;
      runId: string;
    };

export type AutomationStudioMutationKind = AutomationStudioMutation["kind"];

export type AutomationStudioMutationTransaction = Readonly<{
  revision: number;
  mutation: AutomationStudioMutation;
}>;

export type AutomationStudioMutationListener = (
  transaction: AutomationStudioMutationTransaction
) => void;

export type AutomationStudioMutationFilter = Readonly<{
  kinds?: readonly AutomationStudioMutationKind[];
  projectId?: string | null;
  flowId?: string;
}>;

export interface AutomationStudioMutationStore {
  commit(mutation: AutomationStudioMutation): AutomationStudioMutationTransaction;
  getSnapshot(): AutomationStudioMutationTransaction | null;
  subscribe(listener: AutomationStudioMutationListener, filter?: AutomationStudioMutationFilter): () => void;
}

export function mutationMatchesFilter(
  mutation: AutomationStudioMutation,
  filter: AutomationStudioMutationFilter = {}
): boolean {
  if (filter.kinds && !filter.kinds.includes(mutation.kind)) return false;
  if ("projectId" in filter && mutation.projectId !== filter.projectId) return false;
  if (filter.flowId && mutation.flowId !== filter.flowId) return false;
  return true;
}

export function createAutomationStudioMutationStore(): AutomationStudioMutationStore {
  let revision = 0;
  let snapshot: AutomationStudioMutationTransaction | null = null;
  const subscriptions = new Set<{
    listener: AutomationStudioMutationListener;
    filter: AutomationStudioMutationFilter | undefined;
  }>();

  return {
    commit(mutation) {
      snapshot = Object.freeze({ revision: ++revision, mutation: Object.freeze({ ...mutation }) });
      for (const subscription of [...subscriptions]) {
        if (mutationMatchesFilter(mutation, subscription.filter)) subscription.listener(snapshot);
      }
      return snapshot;
    },
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener, filter) {
      const subscription = { listener, filter };
      subscriptions.add(subscription);
      return () => subscriptions.delete(subscription);
    }
  };
}

export const automationStudioMutationStore = createAutomationStudioMutationStore();

export function commitAutomationStudioMutation(
  mutation: AutomationStudioMutation
): AutomationStudioMutationTransaction {
  return automationStudioMutationStore.commit(mutation);
}

export function subscribeToAutomationStudioMutations(
  listener: AutomationStudioMutationListener,
  filter?: AutomationStudioMutationFilter
): () => void {
  return automationStudioMutationStore.subscribe(listener, filter);
}
