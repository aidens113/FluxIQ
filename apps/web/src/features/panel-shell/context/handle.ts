"use client";

import { createContext, type Dispatch } from "react";
import type { PanelContext } from "./types";
import type { PanelContextAction } from "./action";

export type PanelContextValue = {
  context: PanelContext;
  dispatch: Dispatch<PanelContextAction>;
  /** The context as it is now, for a callback that must not re-render with it (the dock's send). */
  read(): PanelContext;
};

export const PanelContextHandle = createContext<PanelContextValue | null>(null);
