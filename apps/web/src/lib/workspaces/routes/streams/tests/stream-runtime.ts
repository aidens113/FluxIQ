import { vi } from "vitest";
import type { WorkspaceRouteCaller, WorkspaceRouteContext, WorkspaceRouteValidation } from "../../types";
import { WorkspaceStreamOwner } from "../owner";
import type { WorkspaceStreamDescriptor, WorkspaceStreamRefusal } from "../types";

export function streamRuntime(signal = new AbortController().signal) {
  const binding = { channel: "panel", workspaceId: "tenant-a", userId: "person-a", sessionId: "session-a" } as const;
  const caller: WorkspaceRouteCaller = { channel: "panel", binding, actor: { sessionId: binding.sessionId, userId: binding.userId, roleId: "operator", permissions: ["programs.read"] } };
  const revalidate = vi.fn(async (): Promise<WorkspaceRouteValidation> => ({ ok: true, caller }));
  const release = vi.fn();
  const current = vi.fn(() => true);
  const context: WorkspaceRouteContext = { workspaceId: binding.workspaceId, fluxiq: {} as WorkspaceRouteContext["fluxiq"], binding, caller, current, revalidate, release };
  const next = vi.fn(async (): Promise<IteratorResult<string | Uint8Array, unknown>> => ({ done: true, value: undefined }));
  const retire = vi.fn(async (): Promise<IteratorResult<string | Uint8Array, unknown>> => ({ done: true, value: undefined }));
  const domain = vi.fn(async (): Promise<WorkspaceStreamRefusal | null> => null);
  const descriptor: WorkspaceStreamDescriptor = { ok: true, iterator: { next, return: retire }, headers: { "Content-Type": "text/csv; charset=utf-8" }, revalidateDomain: domain };
  const observer = vi.fn();
  const owner = new WorkspaceStreamOwner(context, signal, { onCleanupFailure: observer });
  const prepare = vi.fn(async () => descriptor);
  return { caller, context, current, revalidate, release, next, retire, domain, descriptor, observer, owner, prepare };
}

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}
