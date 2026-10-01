"use client";

import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ModalContent, type DialogProps } from "./ModalContent";

export function Modal(props: DialogProps) {
  function submitOnEnter(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey
      || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    const panel = event.currentTarget;
    const target = event.target as HTMLInputElement | null;
    const dialogSelector = '[role="dialog"], [role="alertdialog"]';
    // Native controls and forms own their Enter behavior. React portal ancestry
    // alone must never turn another overlay's event into a confirmation here.
    if (!target || target.tagName !== "INPUT" || !["text", "password", "search", "email", "url", "tel", "number"].includes(target.type)
      || target.isContentEditable || target.readOnly || target.form || !panel.contains(target) || target.closest(dialogSelector) !== panel
      || target.ownerDocument.activeElement !== target || target.ownerDocument.visibilityState === "hidden" || !target.ownerDocument.hasFocus()
      || panel.getAttribute("aria-busy") === "true") return;
    function eligible(element: HTMLElement) {
      const visibility = element.ownerDocument.defaultView?.getComputedStyle(element).visibility;
      return element.isConnected && !element.matches(":disabled") && visibility !== "hidden" && visibility !== "collapse"
        && !element.closest('[hidden], [inert], [aria-hidden="true"]') && element.getClientRects().length > 0;
    }
    if (!eligible(target)) return;
    const submitButton = Array.from(panel.querySelectorAll<HTMLButtonElement>(
      ".modal-actions .button-primary:not(:disabled), [data-modal-submit]:not(:disabled)",
    )).find(button => button.closest(dialogSelector) === panel && eligible(button));
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
