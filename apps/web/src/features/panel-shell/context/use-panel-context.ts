"use client";

import { useContext } from "react";
import { PanelContextHandle, type PanelContextValue } from "./handle";

export function usePanelContext(): PanelContextValue {
  const value = useContext(PanelContextHandle);
  if (!value) throw new Error("usePanelContext needs a PanelContextProvider above it.");
  return value;
}
