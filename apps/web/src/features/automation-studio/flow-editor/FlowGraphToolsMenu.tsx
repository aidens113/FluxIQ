"use client";

import {
  CheckCircle2,
  Ellipsis,
  ListTree,
  Map,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState
} from "react";
import type { Edge, Node as ReactFlowNode, ReactFlowInstance } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";

export function FlowGraphToolsMenu(props: {
  flowInstance: ReactFlowInstance<ReactFlowNode<AutomationFlowNodeData>, Edge> | null;
  flowOutlineOpen: boolean;
  outlineId: string;
  problemCount: number;
  showMiniMap: boolean;
  onToggleOutline(): void;
  onToggleMiniMap(): void;
  onValidate(): void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const run = (command: () => void) => {
    command();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const navigateMenu = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const target = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (current + 1) % items.length
          : event.key === "ArrowUp"
            ? (current - 1 + items.length) % items.length
            : -1;
    if (target < 0) return;
    event.preventDefault();
    items[target]?.focus();
  };

  return (
    <div className="automation-canvas-more" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More canvas tools"
        className="icon-button"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        title="More canvas tools"
        type="button"
      >
        <Ellipsis size={15} aria-hidden />
      </button>
      {open ? (
        <div aria-label="More canvas tools" aria-orientation="vertical" className="automation-canvas-more-menu" onKeyDown={navigateMenu} ref={menuRef} role="menu">
          <button aria-label="Zoom in" onClick={() => run(() => void props.flowInstance?.zoomIn({ duration: 120 }))} role="menuitem" type="button"><ZoomIn size={14} aria-hidden /><span>Zoom in</span></button>
          <button aria-label="Zoom out" onClick={() => run(() => void props.flowInstance?.zoomOut({ duration: 120 }))} role="menuitem" type="button"><ZoomOut size={14} aria-hidden /><span>Zoom out</span></button>
          <button aria-label="Validate graph" onClick={() => run(props.onValidate)} role="menuitem" type="button"><CheckCircle2 size={14} aria-hidden /><span>Validate graph</span>{props.problemCount ? <small>{props.problemCount}</small> : null}</button>
          <button aria-checked={props.showMiniMap} aria-label={props.showMiniMap ? "Hide minimap" : "Show minimap"} onClick={() => run(props.onToggleMiniMap)} role="menuitemcheckbox" type="button"><Map size={14} aria-hidden /><span>Minimap</span></button>
          <button aria-checked={props.flowOutlineOpen} aria-controls={props.outlineId} aria-label={props.flowOutlineOpen ? "Close graph outline" : "Open graph outline"} onClick={() => run(props.onToggleOutline)} role="menuitemcheckbox" type="button"><ListTree size={14} aria-hidden /><span>Graph outline</span></button>
        </div>
      ) : null}
    </div>
  );
}
