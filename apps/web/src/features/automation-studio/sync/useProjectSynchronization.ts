"use client";

import { useEffect, useRef } from "react";
import {
  AutomationStudioProjectSyncClient,
  type AutomationStudioFetchChangePage,
  type AutomationStudioProjectSyncClientOptions,
  type AutomationStudioScopedInvalidation
} from "./project-sync";

export type AutomationStudioMutationEventTarget = {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
};

export type ProjectSynchronizationOpenOptions = {
  projectId: string;
  fetchPage: AutomationStudioFetchChangePage;
  onInvalidations(invalidations: AutomationStudioScopedInvalidation[]): void;
  mutationTarget?: AutomationStudioMutationEventTarget;
  pageSize?: number;
  reconnectDelayMs?: number;
};

type ProjectSyncClient = Pick<AutomationStudioProjectSyncClient, "start" | "stop" | "notifyMutation">;
type ProjectSyncClientFactory = (options: AutomationStudioProjectSyncClientOptions) => ProjectSyncClient;

export class ProjectSynchronizationController {
  private active: { projectId: string; generation: number; client: ProjectSyncClient; removeMutationListener(): void } | null = null;
  private generation = 0;

  constructor(private readonly createClient: ProjectSyncClientFactory = (options) => new AutomationStudioProjectSyncClient(options)) {}

  get projectId(): string | null {
    return this.active?.projectId ?? null;
  }

  open(options: ProjectSynchronizationOpenOptions): void {
    this.close();
    const generation = this.generation;
    const mutationTarget = options.mutationTarget;
    let client: ProjectSyncClient;
    const clientOptions: AutomationStudioProjectSyncClientOptions = {
      projectId: options.projectId,
      fetchPage: options.fetchPage,
      onInvalidations: (invalidations) => {
        if (this.active?.generation !== generation || this.active.projectId !== options.projectId) return;
        options.onInvalidations(invalidations);
      },
      ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
      ...(options.reconnectDelayMs === undefined ? {} : { reconnectDelayMs: options.reconnectDelayMs })
    };
    client = this.createClient(clientOptions);
    const notifyProjectMutation: EventListener = (event) => {
      const detail = (event as CustomEvent<{ programId?: string; projectId?: string }>).detail;
      if (detail?.programId === "automation-studio" && detail.projectId === options.projectId) client.notifyMutation();
    };
    if (mutationTarget) mutationTarget.addEventListener("program-api:mutation", notifyProjectMutation);
    this.active = {
      projectId: options.projectId,
      generation,
      client,
      removeMutationListener: () => mutationTarget?.removeEventListener("program-api:mutation", notifyProjectMutation)
    };
    client.start();
  }

  notifyMutation(): void {
    this.active?.client.notifyMutation();
  }

  close(expectedProjectId?: string): void {
    if (!this.active || (expectedProjectId !== undefined && this.active.projectId !== expectedProjectId)) return;
    const active = this.active;
    this.active = null;
    this.generation += 1;
    active.removeMutationListener();
    active.client.stop();
  }

  dispose(): void {
    this.close();
  }
}

export type UseProjectSynchronizationOptions = Omit<ProjectSynchronizationOpenOptions, "projectId"> & {
  projectId: string | null;
};

export function useProjectSynchronization(options: UseProjectSynchronizationOptions): ProjectSynchronizationController {
  const fetchPageRef = useRef(options.fetchPage);
  const onInvalidationsRef = useRef(options.onInvalidations);
  fetchPageRef.current = options.fetchPage;
  onInvalidationsRef.current = options.onInvalidations;

  const controllerRef = useRef<ProjectSynchronizationController | null>(null);
  if (!controllerRef.current) controllerRef.current = new ProjectSynchronizationController();

  useEffect(() => {
    const controller = controllerRef.current!;
    if (!options.projectId) {
      controller.close();
      return;
    }
    const projectId = options.projectId;
    controller.open({
      projectId,
      fetchPage: (input) => fetchPageRef.current(input),
      onInvalidations: (invalidations) => onInvalidationsRef.current(invalidations),
      ...(options.mutationTarget === undefined ? {} : { mutationTarget: options.mutationTarget }),
      ...(options.pageSize === undefined ? {} : { pageSize: options.pageSize }),
      ...(options.reconnectDelayMs === undefined ? {} : { reconnectDelayMs: options.reconnectDelayMs })
    });
    return () => controller.close(projectId);
  }, [options.mutationTarget, options.pageSize, options.projectId, options.reconnectDelayMs]);

  return controllerRef.current;
}