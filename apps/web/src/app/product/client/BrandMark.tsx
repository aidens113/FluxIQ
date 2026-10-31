"use client";

import type { ReactNode } from "react";
import { usePanelBranding } from "./usePanelBranding";

/** The brand mark: the product's logo (same box as the mark) when it has one, else the given stock icon. */
export function BrandMark(props: { icon: ReactNode }) {
  const { logoUrl, name } = usePanelBranding();
  if (logoUrl) return <img alt={name} className="brand-logo" height={28} src={logoUrl} width={28} />;
  return <span className="brand-mark">{props.icon}</span>;
}
