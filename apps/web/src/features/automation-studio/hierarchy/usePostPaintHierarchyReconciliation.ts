"use client";

import { useCallback, useEffect, useRef } from "react";

type ReconciliationQueue = {
  frame: number | null;
  timer: number | null;
  commits: Array<() => void>;
};

export function usePostPaintHierarchyReconciliation(): (commit: () => void) => void {
  const queueRef = useRef<ReconciliationQueue>({ frame: null, timer: null, commits: [] });
  const schedule = useCallback((commit: () => void) => {
    const queue = queueRef.current;
    queue.commits.push(commit);
    if (queue.frame !== null || queue.timer !== null) return;
    queue.frame = window.requestAnimationFrame(() => {
      queue.frame = null;
      queue.timer = window.setTimeout(() => {
        queue.timer = null;
        const commits = queue.commits.splice(0);
        for (const queuedCommit of commits) queuedCommit();
      }, 0);
    });
  }, []);

  useEffect(() => () => {
    const queue = queueRef.current;
    if (queue.frame !== null) window.cancelAnimationFrame(queue.frame);
    if (queue.timer !== null) window.clearTimeout(queue.timer);
    queue.commits.length = 0;
  }, []);

  return schedule;
}
