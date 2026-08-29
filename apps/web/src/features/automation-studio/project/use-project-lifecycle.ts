"use client";

import { useCallback, useEffect, useRef } from "react";
import { createAutomationProjectLifecycle, type AutomationProjectLifecycleAdapters } from "./project-lifecycle";

export type AutomationProjectOpenOptions = { updateUrl?: boolean };

export function useAutomationProjectLifecycle<Hydration>(options: {
  adapters: AutomationProjectLifecycleAdapters<Hydration>;
  setProjectUrl(projectId: string | null): void;
}) {
  const adaptersRef = useRef(options.adapters);
  const setProjectUrlRef = useRef(options.setProjectUrl);
  adaptersRef.current = options.adapters;
  setProjectUrlRef.current = options.setProjectUrl;
  const lifecycleRef = useRef<ReturnType<typeof createAutomationProjectLifecycle<Hydration>> | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createAutomationProjectLifecycle({
      publishOpening: (projectId) => adaptersRef.current.publishOpening(projectId),
      hydrate: (projectId, signal) => adaptersRef.current.hydrate(projectId, signal),
      commit: (projectId, hydration) => adaptersRef.current.commit(projectId, hydration),
      fail: (projectId, error) => adaptersRef.current.fail(projectId, error),
      clear: (projectId) => adaptersRef.current.clear(projectId)
    });
  }
  useEffect(() => () => lifecycleRef.current?.dispose(), []);

  const openProject = useCallback((projectId: string, openOptions: AutomationProjectOpenOptions = {}) => {
    if (openOptions.updateUrl !== false) setProjectUrlRef.current(projectId);
    return lifecycleRef.current!.open(projectId);
  }, []);
  const closeProject = useCallback(() => {
    lifecycleRef.current!.close();
    setProjectUrlRef.current(null);
  }, []);
  return { openProject, closeProject, activeLifecycleProjectId: () => lifecycleRef.current!.activeProjectId() };
}

export class AutomationProjectDeepLinkAdapter {
  private attemptedProjectId: string | null = null;

  claim(projectId: string | null, activeProjectId: string | null): string | null {
    if (!projectId || activeProjectId === projectId || this.attemptedProjectId === projectId) return null;
    this.attemptedProjectId = projectId;
    return projectId;
  }
}

export function useAutomationProjectDeepLink(input: {
  activeProjectId: string | null;
  projectId: string | null;
  openProject(projectId: string, options: AutomationProjectOpenOptions): Promise<boolean>;
}) {
  const openProjectRef = useRef(input.openProject);
  const adapterRef = useRef<AutomationProjectDeepLinkAdapter | null>(null);
  if (!adapterRef.current) adapterRef.current = new AutomationProjectDeepLinkAdapter();
  openProjectRef.current = input.openProject;
  useEffect(() => {
    const projectId = adapterRef.current!.claim(input.projectId, input.activeProjectId);
    if (projectId) void openProjectRef.current(projectId, { updateUrl: false });
  }, [input.activeProjectId, input.projectId]);
}