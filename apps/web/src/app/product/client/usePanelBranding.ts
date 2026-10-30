"use client";

import { useContext } from "react";
import type { PanelBranding } from "fluxiq/platform/panel";
import { PanelBrandingContext } from "./panel-branding-context";

/** The panel's branding; stock FluxIQ without a provider or a product. */
export function usePanelBranding(): PanelBranding {
  return useContext(PanelBrandingContext);
}
