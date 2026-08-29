"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AutomationViewAdderOption } from "../view-adder";
import type { AutomationWindowAdderState, AutomationWorkspaceArea } from "../layout/contracts";
import { automationWindowDescription, viewTitle } from "./view-metadata";

export function AutomationWindowAdderPalette(props: {
  area: AutomationWorkspaceArea;
  anchor: AutomationWindowAdderState["anchor"];
  targetWindowId?: string;
  options: AutomationViewAdderOption[];
  onAdd(viewId: string, area: AutomationWorkspaceArea, targetWindowId?: string): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement | null);
  const groups: AutomationViewAdderOption["group"][] = ["Flow", "Evidence", "Workspace"];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = props.options.filter((option) => !normalizedQuery || [
    viewTitle(option.view),
    option.view.label,
    automationWindowDescription(option.view),
    option.scope,
    option.placement
  ].join(" ").toLocaleLowerCase().includes(normalizedQuery));

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) props.onClose();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, []);

  return (
    <section aria-label="Add workspace tab" className="automation-window-adder-panel" ref={panelRef} role="dialog" style={automationWindowAdderPanelStyle(props.area, props.anchor)}>
      <header>
        <div><strong>Add Tab</strong><span>{props.area === "right" ? "Inspector" : "Main editor"}</span></div>
        <button aria-label="Close tab picker" className="icon-button" onClick={props.onClose} title="Close" type="button"><X size={14} aria-hidden /></button>
      </header>
      <label className="automation-window-adder-search">
        <Search size={14} aria-hidden />
        <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Find a view" type="search" value={query} />
      </label>
      {groups.map((group) => {
        const options = filtered.filter((option) => option.group === group);
        if (!options.length) return null;
        return (
          <section key={group}>
            <strong>{group}</strong>
            <div>
              {options.map((option) => {
                const Icon = option.view.icon;
                return (
                  <button
                    className="automation-window-adder-option"
                    aria-describedby={"automation-view-option-" + option.view.id}
                    disabled={Boolean(option.disabledReason)}
                    key={option.view.id}
                    onClick={() => props.onAdd(option.view.id, props.area, props.targetWindowId)}
                    type="button"
                  >
                    <Icon size={16} aria-hidden />
                    <span>
                      <strong>{viewTitle(option.view)}</strong>
                      <small id={"automation-view-option-" + option.view.id}>{option.scope} · {option.placement}</small>
                      <small>{option.disabledReason ?? automationWindowDescription(option.view)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!filtered.length ? <p className="automation-window-adder-empty">No matching views.</p> : null}
    </section>
  );
}
export function automationWindowAdderPanelStyle(area: AutomationWorkspaceArea, anchor: AutomationWindowAdderState["anchor"]) {
  const gap = 8;
  const margin = 12;
  const width = Math.min(420, window.innerWidth - 48);
  const height = Math.min(620, window.innerHeight - 126);
  const left = area === "right"
    ? Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.right - width))
    : Math.max(margin, Math.min(window.innerWidth - width - margin, anchor.left));
  const top = Math.max(margin, Math.min(window.innerHeight - height - margin, anchor.bottom + gap));
  return { left, top, width };
}

