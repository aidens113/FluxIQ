"use client";

import type { AnchorHTMLAttributes } from "react";

export function ActionLink({ children, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} className={["action-link", className ?? ""].filter(Boolean).join(" ")}>{children}</a>;
}
