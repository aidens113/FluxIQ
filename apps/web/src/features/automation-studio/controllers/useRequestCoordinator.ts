"use client";

import { useCallback, useEffect, useRef } from "react";
import { recordAutomationStudioRequestLifecycle } from "../../programs/ui-performance";

export type AutomationRequestPhase = "idle" | "loading" | "success" | "error";
export type AutomationRequestState = {
  phase: AutomationRequestPhase;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

export const idleAutomationRequestState: AutomationRequestState = { phase: "idle" };
export class LatestAutomationRequestRegistry {
  private readonly controllers = new Map<string, AbortController>();

  begin(key: string): AbortController {
    this.controllers.get(key)?.abort();
    const controller = new AbortController();
    this.controllers.set(key, controller);
    return controller;
  }

  owns(key: string, controller: AbortController): boolean {
    return this.controllers.get(key) === controller;
  }

  finish(key: string, controller: AbortController): void {
    if (this.owns(key, controller)) this.controllers.delete(key);
  }

  cancel(key: string): void {
    this.controllers.get(key)?.abort();
    this.controllers.delete(key);
  }

  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}

export function nextAutomationRequestState(
  phase: Exclude<AutomationRequestPhase, "idle">,
  now: number,
  current: AutomationRequestState = idleAutomationRequestState,
  error?: string
): AutomationRequestState {
  if (phase === "loading") return { phase, startedAt: now };
  return { phase, ...(current.startedAt !== undefined ? { startedAt: current.startedAt } : {}), finishedAt: now, ...(error ? { error } : {}) };
}

export class AutomationRequestStateStore {
  private states: Record<string, AutomationRequestState> = {};

  get snapshot(): Record<string, AutomationRequestState> {
    return this.states;
  }

  set(key: string, state: AutomationRequestState): void {
    this.states = { ...this.states, [key]: state };
  }

  update(key: string, getNextState: (current: AutomationRequestState | undefined) => AutomationRequestState): void {
    this.set(key, getNextState(this.states[key]));
  }

  reset(key: string): void {
    this.set(key, idleAutomationRequestState);
  }
}

export function useRequestCoordinator() {
  const registryRef = useRef<LatestAutomationRequestRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new LatestAutomationRequestRegistry();
  const requestStateStoreRef = useRef<AutomationRequestStateStore | null>(null);
  if (!requestStateStoreRef.current) requestStateStoreRef.current = new AutomationRequestStateStore();
  const registry = registryRef.current;
  const requestStateStore = requestStateStoreRef.current;

  const runLatest = useCallback(async <T,>(key: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    const controller = registry.begin(key);
    requestStateStore.set(key, nextAutomationRequestState("loading", performance.now()));
    recordAutomationStudioRequestLifecycle(key, { source: "request-coordinator", phase: "loading" });
    try {
      const value = await operation(controller.signal);
      if (controller.signal.aborted || !registry.owns(key, controller)) return undefined;
      requestStateStore.update(key, (current) => nextAutomationRequestState("success", performance.now(), current));
      recordAutomationStudioRequestLifecycle(key, { source: "request-coordinator", phase: "success" });
      return value;
    } catch (error) {
      if (controller.signal.aborted || !registry.owns(key, controller)) return undefined;
      const message = error instanceof Error ? error.message : "Request could not be completed.";
      requestStateStore.update(key, (current) => nextAutomationRequestState("error", performance.now(), current, message));
      recordAutomationStudioRequestLifecycle(key, { source: "request-coordinator", phase: "error" });
      return undefined;
    } finally {
      registry.finish(key, controller);
    }
  }, []);

  const cancel = useCallback((key: string) => {
    registry.cancel(key);
    requestStateStore.reset(key);
    recordAutomationStudioRequestLifecycle(key, { source: "request-coordinator", phase: "cancelled" });
  }, []);

  useEffect(() => () => {
    registry.cancelAll();
  }, []);

  return { requestStates: requestStateStore.snapshot, runLatest, cancel };
}
