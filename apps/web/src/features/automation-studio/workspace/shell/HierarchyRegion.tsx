"use client";

import { memo, type ReactNode } from "react";
import type { AutomationWorkspaceCommandPort } from "../commands/contracts";
import type { AutomationWorkspaceRenderStore } from "../render-store";
import { beginAutomationSectionResize, resizeSidebarFromKeyboard } from "./resize-events";
import { useAutomationWorkspaceSelector } from "./selectors";

export const AutomationHierarchyRegion = memo(function AutomationHierarchyRegion(props: {
  content: ReactNode;
  port: AutomationWorkspaceCommandPort;
  store: AutomationWorkspaceRenderStore;
}) {
  const state = useAutomationWorkspaceSelector(props.store, (prefs) => ({
    collapsed: prefs.leftSidebarCollapsed,
    width: prefs.sidebarWidth
  }), (left, right) => left.collapsed === right.collapsed && left.width === right.width);
  return (
    <aside className="automation-studio-sidebar-shell" style={{ minWidth: 0, position: "relative" }}>
      {props.content}
      {!state.collapsed ? (
        <button
          aria-label="Resize hierarchy"
          aria-orientation="vertical"
          aria-valuemax={420}
          aria-valuemin={220}
          aria-valuenow={state.width}
          className="automation-section-resize-handle hierarchy"
          onKeyDown={(event) => resizeSidebarFromKeyboard(event, props.port)}
          onPointerDown={(event) => {
            const shell = event.currentTarget.closest<HTMLElement>(".automation-studio-shell");
            const previousColumns = shell?.style.gridTemplateColumns ?? "";
            beginAutomationSectionResize({
              axis: "x",
              event,
              min: 220,
              max: 420,
              startValue: state.width,
              transient: (width) => {
                if (shell) shell.style.gridTemplateColumns = `${width}px minmax(0, 1fr)`;
              },
              restore: () => {
                if (shell) shell.style.gridTemplateColumns = previousColumns;
              },
              commit: (width) => props.port.commit(
                (current) => ({ ...current, sidebarWidth: width }),
                { persist: true, scope: "sidebar" }
              )
            });
          }}
          role="separator"
          title="Resize hierarchy"
          type="button"
        />
      ) : null}
    </aside>
  );
});
