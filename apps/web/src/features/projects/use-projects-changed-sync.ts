"use client";

import { useCallback, useEffect, useRef } from "react";
import { notifyProjectsChanged, PROJECTS_CHANGED_EVENT } from "../panel-shell";

/**
 * Keeps a project list in step with the panel's one shared signal. A project created, renamed or removed
 * anywhere (the top bar's picker, the Flows picker) announces it; `read` runs then. The returned `announce`
 * tells everyone else about this list's own changes without sending this list back to read again.
 */
export function useProjectsChangedSync(read: () => void): () => void {
  const latest = useRef(read);
  latest.current = read;
  const announcing = useRef(false);
  useEffect(() => {
    const changedElsewhere = () => {
      if (!announcing.current) latest.current();
    };
    window.addEventListener(PROJECTS_CHANGED_EVENT, changedElsewhere);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, changedElsewhere);
  }, []);
  return useCallback(() => {
    announcing.current = true;
    try {
      notifyProjectsChanged();
    } finally {
      announcing.current = false;
    }
  }, []);
}
