"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useRequestCoordinator() {
  const registryRef = useRef(new LatestAutomationRequestRegistry());
  const [requestStates, setRequestStates] = useState<Record<string, AutomationRequestState>>({});

  const runLatest = useCallback(async <T,>(key: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    const controller = registryRef.current.begin(key);
    setRequestStates((current) => ({
      ...current,
      [key]: nextAutomationRequestState("loading", performance.now())
    }));
    try {
      const value = await operation(controller.signal);
      if (controller.signal.aborted || !registryRef.current.owns(key, controller)) return undefined;
      setRequestStates((current) => ({
        ...current,
        [key]: nextAutomationRequestState("success", performance.now(), current[key])
      }));
      return value;
    } catch (error) {
      if (controller.signal.aborted || !registryRef.current.owns(key, controller)) return undefined;
      const message = error instanceof Error ? error.message : "Request could not be completed.";
      setRequestStates((current) => ({
        ...current,
        [key]: nextAutomationRequestState("error", performance.now(), current[key], message)
      }));
      return undefined;
    } finally {
      registryRef.current.finish(key, controller);
    }
  }, []);

  const cancel = useCallback((key: string) => {
    registryRef.current.cancel(key);
    setRequestStates((current) => ({ ...current, [key]: idleAutomationRequestState }));
  }, []);

  useEffect(() => () => {
    registryRef.current.cancelAll();
  }, []);

  return { requestStates, runLatest, cancel };
}