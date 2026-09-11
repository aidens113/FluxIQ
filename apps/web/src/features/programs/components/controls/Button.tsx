"use client";

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "secondary" | "primary" | "danger" | "ghost";
export type ButtonSize = "compact" | "default";

export function Button({ busy = false, children, className, disabled, size = "default", variant = "secondary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; size?: ButtonSize; variant?: ButtonVariant }) {
  const classes = ["button", `button-${variant}`, size === "compact" ? "compact" : "", className ?? ""].filter(Boolean).join(" ");
  return <button {...props} aria-busy={busy || undefined} className={classes} disabled={disabled || busy} type={type}>
    {busy ? <LoaderCircle className="spin" size={14} aria-hidden /> : null}
    {children}
  </button>;
}
