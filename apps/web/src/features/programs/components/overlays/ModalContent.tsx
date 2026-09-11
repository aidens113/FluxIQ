"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { acquireOverlayEnvironment, type OverlayEnvironmentMode } from "../../overlay-environment";
import { useInheritedOperationBusy } from "../../use-operation-lock";
import { IconButton } from "../controls";

export type DialogProps = {
  title: string;
  children: ReactNode;
  className?: string;
  description?: string;
  busy?: boolean;
  closeOnEscape?: boolean;
  dialogRole?: "dialog" | "alertdialog";
  onClose(): void;
};

export function ModalContent(props: DialogProps & { onKeyDown?(event: KeyboardEvent<HTMLElement>): void; overlayMode?: Extract<OverlayEnvironmentMode, "modal" | "drawer"> }) {
  const panelRef = useRef<HTMLElement>(null);
  const behaviorRef = useRef({ busy: false, closeOnEscape: true, onClose: props.onClose });
  const titleId = `dialog-title-${useId().replace(/:/g, "")}`;
  const descriptionId = props.description ? `${titleId}-description` : undefined;
  const busy = Boolean(props.busy || useInheritedOperationBusy());
  behaviorRef.current = { busy, closeOnEscape: props.closeOnEscape !== false, onClose: props.onClose };

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = panel.closest<HTMLElement>("[data-overlay-root]") ?? panel;
    const release = acquireOverlayEnvironment(document, {
      mode: props.overlayMode ?? "modal",
      panel,
      root,
      returnFocus,
      canDismiss: () => behaviorRef.current.closeOnEscape && !behaviorRef.current.busy,
      onEscape: () => behaviorRef.current.onClose(),
      trapFocus: true
    });
    const initial = panel.querySelector<HTMLElement>("[data-autofocus], [autofocus], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)");
    (initial ?? panel).focus({ preventScroll: true });
    return () => {
      release();
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    props.onKeyDown?.(event);
  }

  return (
    <section
      aria-busy={busy || undefined}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      aria-modal="true"
      className={`modal-panel${props.className ? ` ${props.className}` : ""}`}
      onKeyDown={handleKeyDown}
      ref={panelRef}
      role={props.dialogRole ?? "dialog"}
      tabIndex={-1}
    >
      <div className="panel-heading">
        <div className="dialog-heading-copy">
          <h2 className="panel-title" id={titleId}>{props.title}</h2>
          {props.description ? <p id={descriptionId}>{props.description}</p> : null}
        </div>
        <IconButton disabled={busy} label="Close" onClick={props.onClose}><X size={16} aria-hidden /></IconButton>
      </div>
      <fieldset className="modal-operation-boundary" disabled={busy}>{props.children}</fieldset>
    </section>
  );
}
