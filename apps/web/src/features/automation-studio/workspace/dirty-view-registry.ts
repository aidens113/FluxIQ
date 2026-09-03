export type DirtyViewRegistration = {
  id: string;
  viewId: string;
  label: string;
  dirty: boolean;
  save(authorizationPin?: string): void | Promise<void>;
  discard(): void;
};

export type DirtyViewDecision = {
  actionLabel: string;
  entries: readonly DirtyViewRegistration[];
};

type PendingDecision = DirtyViewDecision & { proceed(): void };
type Snapshot = { revision: number; pending: DirtyViewDecision | null; dirtyCount: number };

const entries = new Map<string, DirtyViewRegistration>();
const listeners = new Set<() => void>();
let pending: PendingDecision | null = null;
let snapshot: Snapshot = { revision: 0, pending: null, dirtyCount: 0 };

export function registerDirtyView(entry: DirtyViewRegistration): () => void {
  entries.set(entry.id, entry);
  publish();
  return () => {
    if (entries.get(entry.id) !== entry) return;
    entries.delete(entry.id);
    publish();
  };
}

export function updateDirtyView(id: string, update: Partial<Pick<DirtyViewRegistration, "viewId" | "label" | "dirty">>): void {
  const current = entries.get(id);
  if (!current) return;
  if (current.viewId === (update.viewId ?? current.viewId) && current.label === (update.label ?? current.label) && current.dirty === (update.dirty ?? current.dirty)) return;
  Object.assign(current, update);
  publish();
}

export function requestDirtyViewDecision(options: { actionLabel: string; viewIds?: readonly string[]; proceed(): void }): boolean {
  const allowed = options.viewIds ? new Set(options.viewIds) : null;
  const affected = [...entries.values()].filter((entry) => entry.dirty && (!allowed || allowed.has(entry.viewId)));
  if (!affected.length) {
    options.proceed();
    return true;
  }
  pending = { actionLabel: options.actionLabel, entries: affected, proceed: options.proceed };
  publish();
  return false;
}

export async function resolveDirtyViewDecision(decision: "save" | "discard" | "cancel", authorizationPin?: string): Promise<void> {
  const current = pending;
  if (!current) return;
  if (decision === "save") {
    await Promise.all(current.entries.map((entry) => entry.save(authorizationPin)));
    if (pending === current) {
      pending = null;
      publish();
    }
    return;
  }
  pending = null;
  publish();
  if (decision === "cancel") return;
  for (const entry of current.entries) entry.discard();
  current.proceed();
}

export function hasDirtyAutomationViews(): boolean {
  return [...entries.values()].some((entry) => entry.dirty);
}

export async function saveDirtyAutomationViews(authorizationPin: string): Promise<number> {
  const dirty = [...entries.values()].filter((entry) => entry.dirty);
  for (const entry of dirty) await entry.save(authorizationPin);
  return dirty.length;
}

export function isDirtyAutomationView(viewId: string): boolean {
  return [...entries.values()].some((entry) => entry.viewId === viewId && entry.dirty);
}

export function dirtyViewRegistrySnapshot(): Snapshot {
  return snapshot;
}

export function subscribeDirtyViewRegistry(listener: () => void): () => void {
  const releaseTelemetry = trackAutomationSubscription();
  listeners.add(listener);
  return () => { listeners.delete(listener); releaseTelemetry(); };
}

export function resetDirtyViewRegistryForTests(): void {
  entries.clear();
  pending = null;
  publish();
}

function publish(): void {
  snapshot = {
    revision: snapshot.revision + 1,
    pending: pending ? { actionLabel: pending.actionLabel, entries: [...pending.entries] } : null,
    dirtyCount: [...entries.values()].filter((entry) => entry.dirty).length
  };
  for (const listener of listeners) listener();
}
import { trackAutomationSubscription } from "../testing/resource-telemetry";
