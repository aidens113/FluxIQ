"use client";

// The project tree's scroll viewport: its measured height and scroll offset
// (the inputs of the virtual window), and focusing a row by id, which scrolls
// the row into view first so the virtual window has rendered it.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIEvent } from "react";
import {
  AUTOMATION_HIERARCHY_DEFAULT_VIEWPORT_HEIGHT,
  AUTOMATION_HIERARCHY_ROW_HEIGHT,
  automationHierarchyRowIndex,
  type AutomationHierarchyFlatRow
} from "../virtualized-tree";

export function useAutomationHierarchyTreeViewport(options: {
  flatRows: AutomationHierarchyFlatRow[];
  previewFocus(id: string): void;
}) {
  const { flatRows, previewFocus } = options;
  const viewportRef = useRef<HTMLElement | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: AUTOMATION_HIERARCHY_DEFAULT_VIEWPORT_HEIGHT });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const height = Math.max(AUTOMATION_HIERARCHY_ROW_HEIGHT, element.clientHeight);
      setViewport((current) => current.height === height ? current : { ...current, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const focusRow = useCallback((id: string) => {
    const index = automationHierarchyRowIndex(flatRows, id);
    if (index < 0) return;
    previewFocus(id);
    const element = viewportRef.current;
    if (element) {
      const top = index * AUTOMATION_HIERARCHY_ROW_HEIGHT;
      const bottom = top + AUTOMATION_HIERARCHY_ROW_HEIGHT;
      let scrollTop = element.scrollTop;
      if (top < scrollTop) scrollTop = top;
      else if (bottom > scrollTop + element.clientHeight) scrollTop = bottom - element.clientHeight;
      if (scrollTop !== element.scrollTop) {
        element.scrollTop = scrollTop;
        setViewport((current) => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
      }
    }
    window.requestAnimationFrame(() => viewportRef.current
      ?.querySelector<HTMLElement>(`[data-tree-item-id="${CSS.escape(id)}"]`)
      ?.focus());
  }, [flatRows, previewFocus]);

  const handleScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const scrollTop = event.currentTarget.scrollTop;
    setViewport((current) => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
  }, []);

  return { viewportRef, viewport, focusRow, handleScroll };
}
