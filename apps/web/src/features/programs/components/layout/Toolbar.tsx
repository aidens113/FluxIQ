"use client";

import type { ReactNode } from "react";

export function Toolbar(props: { label: string; children: ReactNode; orientation?: "horizontal" | "vertical" }) {
  return <div aria-label={props.label} aria-orientation={props.orientation ?? "horizontal"} className={`toolbar ${props.orientation ?? "horizontal"}`} role="toolbar">{props.children}</div>;
}
