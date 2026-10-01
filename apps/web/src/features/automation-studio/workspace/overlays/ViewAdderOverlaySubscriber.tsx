"use client";

import { Search, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { automationWindowDescription, viewTitle } from "../components/view-metadata";
import { automationViewGroupLabel } from "../view-adder";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import { AccessibleFloatingOverlay } from "./accessible-floating-overlay";
import type { ViewAdderOverlayCommand, ViewAdderOverlayRequest } from "./contracts";
import { useAutomationOverlaySelection, type AutomationStudioOverlayStore } from "./overlay-state-store";

export function ViewAdderOverlaySubscriber(props: {
  dispatch: OverlayCommandDispatcher<ViewAdderOverlayCommand>;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "viewAdder");
  if (!request) return null;
  return (
    <ViewAdderOverlaySurface
      dispatch={props.dispatch}
      key={request.id}
      onClose={() => props.store.close("viewAdder", request.id)}
      request={request}
    />
  );
}

export function ViewAdderOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<ViewAdderOverlayCommand>;
  onClose(): void;
  request: ViewAdderOverlayRequest;
}) {
  const [query, setQuery] = useState("");
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownership = useRef({ request: props.request, pending: false, intent: "none" as "none" | "cancel" | "action" });
  if (ownership.current.request !== props.request) ownership.current = { request: props.request, pending: false, intent: "none" };
  const owner = ownership.current;
  const current = () => mounted.current && ownership.current === owner;
  const closeRef = useRef(props.onClose); closeRef.current = props.onClose;
  const normalized = query.trim().toLocaleLowerCase();
  const options = props.request.options.filter((option) => !normalized || [
    viewTitle(option.view),
    option.view.label,
    automationWindowDescription(option.view),
    option.scope,
    option.placement
  ].join(" ").toLocaleLowerCase().includes(normalized));

  async function add(viewId: string) {
    if (!current() || owner.pending || status.pending || !props.request.options.some((option) => option.view.id === viewId && !option.disabledReason)) return;
    owner.pending = true;
    const command: ViewAdderOverlayCommand = {
      type: "workspace.view.add",
      requestId: props.request.id,
      viewId,
      area: props.request.area,
      ...(props.request.targetWindowId ? { targetWindowId: props.request.targetWindowId } : {})
    };
    try {
      if (await execute(command) && current()) { owner.intent = "action"; closeRef.current(); }
    } finally { owner.pending = false; }
  }

  function cancel() {
    if (!current() || owner.pending || status.pending) return;
    owner.intent = "cancel"; closeRef.current();
  }

  return (
    <AccessibleFloatingOverlay
      anchor={props.request.anchor}
      ariaLabel="Open a panel"
      busy={status.pending}
      className="automation-window-adder-panel"
      onClose={cancel}
      shouldReturnFocus={() => ownership.current === owner && owner.intent === "cancel"}
      preferredWidth={420}
    >
      <header>
        <div><strong>Open a panel</strong><span>{props.request.area === "right" ? "Details panel" : "Main area"}</span></div>
        <button aria-label="Close the panel picker" className="icon-button" disabled={status.pending} onClick={cancel} type="button"><X aria-hidden size={14} /></button>
      </header>
      <label className="automation-window-adder-search">
        <Search aria-hidden size={14} />
        <input autoFocus onChange={(event) => { if (current()) setQuery(event.target.value); }} placeholder="Find a panel" type="search" value={query} />
      </label>
      {(["Flow", "Evidence", "Workspace"] as const).map((group) => {
        const grouped = options.filter((option) => option.group === group);
        if (!grouped.length) return null;
        return (
          <section key={group}>
            <strong>{automationViewGroupLabel(group)}</strong>
            <div>
              {grouped.map((option) => {
                const Icon = option.view.icon;
                return (
                  <button
                    className="automation-window-adder-option"
                    disabled={Boolean(option.disabledReason) || status.pending}
                    key={option.view.id}
                    onClick={() => void add(option.view.id)}
                    type="button"
                  >
                    <Icon aria-hidden size={16} />
                    <span>
                      <strong>{viewTitle(option.view)}</strong>
                      <small>{option.scope} | {option.placement}</small>
                      <small>{option.disabledReason ?? automationWindowDescription(option.view)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {!options.length ? <p className="automation-window-adder-empty">No panel matches that.</p> : null}
      {status.error ? <p className="field-error" role="alert">{status.error}</p> : null}
    </AccessibleFloatingOverlay>
  );
}
