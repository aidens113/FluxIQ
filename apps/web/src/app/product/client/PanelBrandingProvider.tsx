"use client";

import type { ReactNode } from "react";
import type { PanelBranding } from "fluxiq/platform/panel";
import { PanelBrandingContext } from "./panel-branding-context";

export function PanelBrandingProvider(props: { branding: PanelBranding; children: ReactNode }) {
  return <PanelBrandingContext.Provider value={props.branding}>{props.children}</PanelBrandingContext.Provider>;
}
