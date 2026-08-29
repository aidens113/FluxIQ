"use client";

import { useEffect, useRef } from "react";

export type AutomationLiveCommandScope = {
  projectId: string;
  generation: number;
};

export class AutomationLiveCommandScopeController {
  private projectId: string | null = null;
  private generation = 0;
  private controller = new AbortController();

  activate(projectId: string | null): void {
    if (this.projectId === projectId) return;
    this.controller.abort();
    this.controller = new AbortController();
    this.projectId = projectId;
    this.generation += 1;
  }

  current(): AutomationLiveCommandScope | null {
    return this.projectId ? { projectId: this.projectId, generation: this.generation } : null;
  }

  signal(): AbortSignal {
    return this.controller.signal;
  }

  isCurrent(scope: AutomationLiveCommandScope): boolean {
    return !this.controller.signal.aborted
      && scope.projectId === this.projectId
      && scope.generation === this.generation;
  }

  dispose(): void {
    this.controller.abort();
    this.projectId = null;
    this.generation += 1;
  }
}

export function useAutomationLiveCommandScope(projectId: string | null): AutomationLiveCommandScopeController {
  const controllerRef = useRef<AutomationLiveCommandScopeController | null>(null);
  if (!controllerRef.current) controllerRef.current = new AutomationLiveCommandScopeController();
  const controller = controllerRef.current;

  useEffect(() => {
    controller.activate(projectId);
  }, [controller, projectId]);

  useEffect(() => () => controller.dispose(), [controller]);
  return controller;
}