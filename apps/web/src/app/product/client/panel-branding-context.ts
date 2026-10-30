"use client";

import { createContext } from "react";
import type { PanelBranding } from "fluxiq/platform/panel";
import { STOCK_PANEL_BRANDING } from "./stock-panel-branding";

export const PanelBrandingContext = createContext<PanelBranding>(STOCK_PANEL_BRANDING);
