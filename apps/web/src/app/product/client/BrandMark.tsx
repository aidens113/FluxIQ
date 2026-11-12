"use client";

import type { ReactNode } from "react";
import { usePanelBranding } from "./usePanelBranding";

/** Where the stock FluxIQ mark is served (apps/web/public). */
export const STOCK_MARK_URL = "/fluxiq-mark.svg";

/** The brand mark: the product's logo when it has one, else FluxIQ's own mark. `icon` is accepted for existing callers and no longer drawn. */
export function BrandMark(_props: { icon?: ReactNode }) {
  const { logoUrl, name } = usePanelBranding();
  if (logoUrl) return <img alt={name} className="brand-logo" height={28} src={logoUrl} width={28} />;
  return <img alt="" aria-hidden className="brand-logo" height={28} src={STOCK_MARK_URL} width={28} />;
}
