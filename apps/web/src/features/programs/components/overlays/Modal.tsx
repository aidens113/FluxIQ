"use client";

import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ModalContent, type DialogProps } from "./ModalContent";

export function Modal(props: DialogProps) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
    const submitButton = event.currentTarget.querySelector<HTMLButtonElement>(
      ".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)",
    );
    if (!submitButton) return;
    event.preventDefault();
    submitButton.click();
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="modal-backdrop" data-overlay-root="modal">
      <ModalContent {...props} onKeyDown={submitOnEnter} overlayMode="modal" />
    </div>,
    document.body,
  );
}
