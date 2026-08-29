"use client";

import { useEffect } from "react";
import { notifyGlobalAlert } from "../../programs/shared-ui";

type ExternalLifecycleOptions = {
  actionStatus: string;
  activeProjectName: string | null;
  hasDirtyGraph: boolean;
  selectionKey: string;
  setNarrow: (narrow: boolean) => void;
  narrowPanel: string | null;
  setNarrowPanel: (panel: null) => void;
};

export function useAutomationExternalLifecycle(options: ExternalLifecycleOptions): void {
  useEffect(() => {
    const query = window.matchMedia("(max-width: 820px)");
    const update = () => {
      options.setNarrow(query.matches);
      if (!query.matches) options.setNarrowPanel(null);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [options.setNarrow, options.setNarrowPanel]);

  useEffect(() => {
    if (options.narrowPanel === "hierarchy") options.setNarrowPanel(null);
  }, [options.narrowPanel, options.selectionKey, options.setNarrowPanel]);

  useEffect(() => {
    document.title = options.activeProjectName
      ? options.activeProjectName + " - Automation Studio"
      : "Automation Studio";
  }, [options.activeProjectName]);

  useEffect(() => {
    if (!options.actionStatus) return;
    notifyGlobalAlert({
      tone: /failed|cannot|required|could not|no .*available|not connected|read-only/i.test(options.actionStatus)
        ? "error"
        : /running|loading|generating|finalizing|normalizing|mining/i.test(options.actionStatus) ? "warning" : "info",
      title: "Automation Studio",
      message: options.actionStatus,
      id: "automation-action:" + options.actionStatus
    });
  }, [options.actionStatus]);

  useEffect(() => {
    if (!options.hasDirtyGraph) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [options.hasDirtyGraph]);
}