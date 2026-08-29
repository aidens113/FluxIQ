import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import type { AutomationWorkspaceCommandPort, AutomationWorkspaceCommands } from "../commands/contracts";
import { createAutomationResizeSession } from "../commands/resize";
import { resizeAutomationMainSplitRatios } from "../layout/mutations";

export function automationPaneGridStyle(preset: string, ratios: readonly number[]): CSSProperties {
  return preset === "two-rows"
    ? { gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: ratios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" ") }
    : { gridTemplateColumns: ratios.map((ratio) => `minmax(0, ${ratio}fr)`).join(" "), gridTemplateRows: "minmax(0, 1fr)" };
}

export function automationPaneSplitHandles(ratios: readonly number[]) {
  let accumulated = 0;
  return ratios.slice(0, -1).map((ratio, index) => {
    accumulated += ratio;
    return { index, offsetPct: accumulated * 100 };
  });
}

export function startAutomationSplitResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  port: AutomationWorkspaceCommandPort,
  splitIndex: number,
  vertical: boolean
) {
  event.preventDefault();
  event.stopPropagation();
  const layout = event.currentTarget.closest<HTMLElement>(".automation-strict-pane-layout");
  const previousColumns = layout?.style.gridTemplateColumns ?? "";
  const previousRows = layout?.style.gridTemplateRows ?? "";
  const bounds = layout?.getBoundingClientRect();
  const total = Math.max(1, vertical ? bounds?.height ?? 1 : bounds?.width ?? 1);
  const start = vertical ? event.clientY : event.clientX;
  const ratios = [...port.read().mainSplitRatios];
  let nextRatios = ratios;
  const session = createAutomationResizeSession({
    startPointer: start,
    startValue: 0,
    min: -total,
    max: total,
    onTransient(delta) {
      nextRatios = resizeAutomationMainSplitRatios(ratios, splitIndex, delta / total);
      if (layout) Object.assign(layout.style, automationPaneGridStyle(vertical ? "two-rows" : "columns", nextRatios));
    },
    onCommit() {
      port.commit((current) => ({ ...current, mainSplitRatios: nextRatios }), { persist: true, scope: "panes" });
    },
    onCancel() {
      if (!layout) return;
      layout.style.gridTemplateColumns = previousColumns;
      layout.style.gridTemplateRows = previousRows;
    }
  });
  const move = (pointer: PointerEvent) => session.move(vertical ? pointer.clientY : pointer.clientX);
  const cleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
  };
  const finish = () => {
    session.finish();
    cleanup();
  };
  const cancel = () => {
    session.cancel();
    cleanup();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", cancel, { once: true });
  window.addEventListener("blur", cancel, { once: true });
}

export function startAutomationTabDrag(paneId: string, viewId: string, event: DragEvent<HTMLButtonElement>) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-fluxiq-automation-pane-tab", JSON.stringify({ paneId, viewId }));
}

export function dropAutomationTab(
  commands: AutomationWorkspaceCommands,
  targetPaneId: string,
  targetViewId: string | null,
  placement: "before" | "after" | "end",
  event: DragEvent<HTMLElement>
) {
  event.preventDefault();
  event.stopPropagation();
  try {
    const value = JSON.parse(event.dataTransfer.getData("application/x-fluxiq-automation-pane-tab")) as unknown;
    if (!isTabDrag(value)) return;
    commands.movePaneTab(value.paneId, targetPaneId, value.viewId, targetViewId, placement);
  } catch {
    return;
  }
}

function isTabDrag(value: unknown): value is { paneId: string; viewId: string } {
  return Boolean(value && typeof value === "object"
    && typeof (value as { paneId?: unknown }).paneId === "string"
    && typeof (value as { viewId?: unknown }).viewId === "string");
}
