"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function IconButton({ children, className, label, type = "button", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & { children: ReactNode; label: string }) {
  return <button {...props} aria-label={label} className={["icon-button", className ?? ""].filter(Boolean).join(" ")} title={label} type={type}>{children}</button>;
}
