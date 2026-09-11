"use client";

import { createPortal } from "react-dom";
import { ModalContent, type DialogProps } from "./ModalContent";

export function Drawer(props: DialogProps & { side?: "left" | "right" }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="drawer-backdrop" data-overlay-root="drawer">
      <ModalContent {...props} className={`drawer-panel ${props.side ?? "right"}${props.className ? ` ${props.className}` : ""}`} overlayMode="drawer" />
    </div>,
    document.body,
  );
}
