import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { AutomationWorkspaceCommandPort } from "../commands/contracts";
import {
  automationKeyboardResizeValue,
  automationKeyboardSplitRatios,
  createAutomationResizeSession
} from "../commands/resize";
import { automationBottomDockMaxHeight, automationBottomDockMinHeight } from "../layout/defaults";

type ResizeAxis = "x" | "y";

export function beginAutomationSectionResize(options: {
  axis: ResizeAxis;
  direction?: 1 | -1;
  event: ReactPointerEvent<HTMLElement>;
  max: number;
  min: number;
  startValue: number;
  transient(value: number): void;
  commit(value: number): void;
  restore?(): void;
}) {
  options.event.preventDefault();
  options.event.stopPropagation();
  const startPointer = options.axis === "x" ? options.event.clientX : options.event.clientY;
  const session = createAutomationResizeSession({
    startPointer,
    startValue: options.startValue,
    ...(options.direction ? { direction: options.direction } : {}),
    min: options.min,
    max: options.max,
    onTransient: options.transient,
    onCommit: options.commit,
    ...(options.restore ? { onCancel: options.restore } : {})
  });
  const move = (event: PointerEvent) => session.move(options.axis === "x" ? event.clientX : event.clientY);
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

export function resizeSidebarFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  port: AutomationWorkspaceCommandPort
) {
  const prefs = port.read();
  const value = automationKeyboardResizeValue({
    key: event.key,
    value: prefs.sidebarWidth,
    decreaseKey: "ArrowLeft",
    increaseKey: "ArrowRight",
    min: 220,
    max: 420,
    home: 280
  });
  if (value === null) return;
  event.preventDefault();
  port.commit((current) => ({ ...current, sidebarWidth: value }), { persist: true, scope: "sidebar" });
}

export function resizeInspectorFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  port: AutomationWorkspaceCommandPort
) {
  const prefs = port.read();
  const value = automationKeyboardResizeValue({
    key: event.key,
    value: prefs.inspectorWidth,
    decreaseKey: "ArrowRight",
    increaseKey: "ArrowLeft",
    min: 260,
    max: 620,
    home: 320
  });
  if (value === null) return;
  event.preventDefault();
  port.commit(
    (current) => ({ ...current, inspectorWidth: value, rightSidebarCollapsed: false }),
    { persist: true, scope: "right-sidebar" }
  );
}

export function resizeTimelineFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  port: AutomationWorkspaceCommandPort
) {
  const prefs = port.read();
  const value = automationKeyboardResizeValue({
    key: event.key,
    value: prefs.bottomTimelineHeight,
    decreaseKey: "ArrowDown",
    increaseKey: "ArrowUp",
    min: automationBottomDockMinHeight,
    max: automationBottomDockMaxHeight,
    home: 220
  });
  if (value === null) return;
  event.preventDefault();
  port.commit((current) => ({
    ...current,
    bottomTimelineHeight: value,
    bottomTimelineCollapsed: false,
    bottomDock: { ...current.bottomDock, expanded: true }
  }), { persist: true, scope: "timeline" });
}

export function resizeSplitFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  port: AutomationWorkspaceCommandPort,
  splitIndex: number
) {
  const prefs = port.read();
  const orientation = prefs.mainLayoutPreset === "two-rows" ? "vertical" : "horizontal";
  const ratios = automationKeyboardSplitRatios(prefs.mainSplitRatios, splitIndex, event.key, orientation);
  if (!ratios) return;
  event.preventDefault();
  port.commit((current) => ({ ...current, mainSplitRatios: ratios }), { persist: true, scope: "panes" });
}
