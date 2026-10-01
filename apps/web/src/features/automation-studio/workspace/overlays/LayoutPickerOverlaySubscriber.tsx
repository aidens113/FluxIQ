"use client";

import { useLayoutEffect, useRef } from "react";
import { automationLayoutPresetOptions } from "../layout/defaults";
import type { AutomationLayoutPresetOption } from "../layout/contracts";
import { automationAreaLabel } from "../components/primitives";
import { useAtomicOverlayCommand, type OverlayCommandDispatcher } from "./atomic-command";
import { AccessibleFloatingOverlay } from "./accessible-floating-overlay";
import type { LayoutPickerOverlayCommand, LayoutPickerOverlayRequest } from "./contracts";
import { useAutomationOverlaySelection, type AutomationStudioOverlayStore } from "./overlay-state-store";

export function LayoutPickerOverlaySubscriber(props: {
  dispatch: OverlayCommandDispatcher<LayoutPickerOverlayCommand>;
  store: AutomationStudioOverlayStore;
}) {
  const request = useAutomationOverlaySelection(props.store, "layoutPicker");
  if (!request) return null;
  return (
    <LayoutPickerOverlaySurface
      dispatch={props.dispatch}
      key={request.id}
      onClose={() => props.store.close("layoutPicker", request.id)}
      request={request}
    />
  );
}

export function layoutOptionsForOverlay(request: LayoutPickerOverlayRequest): AutomationLayoutPresetOption[] {
  return automationLayoutPresetOptions.filter((option) =>
    request.area === "right"
      ? option.id === "single" || option.id === "two-rows"
      : option.id !== "two-rows"
  );
}

export function LayoutPickerOverlaySurface(props: {
  dispatch: OverlayCommandDispatcher<LayoutPickerOverlayCommand>;
  onClose(): void;
  request: LayoutPickerOverlayRequest;
}) {
  const { execute, status } = useAtomicOverlayCommand(props.dispatch);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const ownership = useRef({ request: props.request, pending: false, intent: "none" as "none" | "cancel" | "action" });
  if (ownership.current.request !== props.request) ownership.current = { request: props.request, pending: false, intent: "none" };
  const owner = ownership.current;
  const current = () => mounted.current && ownership.current === owner;
  const closeRef = useRef(props.onClose); closeRef.current = props.onClose;

  async function arrange(preset: LayoutPickerOverlayCommand["preset"]) {
    if (!current() || owner.pending || status.pending || !layoutOptionsForOverlay(props.request).some((option) => option.id === preset)) return;
    owner.pending = true;
    try {
      if (await execute({ type: "workspace.layout.arrange", requestId: props.request.id, area: props.request.area, preset }) && current()) {
        owner.intent = "action"; closeRef.current();
      }
    } finally { owner.pending = false; }
  }

  function cancel() {
    if (!current() || owner.pending || status.pending) return;
    owner.intent = "cancel"; closeRef.current();
  }

  return (
    <AccessibleFloatingOverlay
      anchor={props.request.anchor}
      ariaLabel="Arrange workspace windows"
      busy={status.pending}
      className="automation-layout-picker-panel"
      onClose={cancel}
      shouldReturnFocus={() => ownership.current === owner && owner.intent === "cancel"}
      preferredWidth={320}
    >
      <header><strong>Arrange Windows</strong><span>{automationAreaLabel(props.request.area)}</span></header>
      <div className="automation-layout-picker-grid">
        {layoutOptionsForOverlay(props.request).map((preset) => (
          <button disabled={status.pending} key={preset.id} onClick={() => void arrange(preset.id)} title={preset.title} type="button">
            <span aria-hidden className="automation-layout-icon">
              {preset.cells.map((cell, index) => <i key={index} style={{ height: `${cell.h * 100}%`, left: `${cell.x * 100}%`, top: `${cell.y * 100}%`, width: `${cell.w * 100}%` }} />)}
            </span>
            <span><strong>{preset.label}</strong><small>{preset.title}</small></span>
          </button>
        ))}
      </div>
      {status.error ? <p className="field-error" role="alert">{status.error}</p> : null}
    </AccessibleFloatingOverlay>
  );
}
