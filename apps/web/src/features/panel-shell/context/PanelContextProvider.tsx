"use client";

import { useCallback, useMemo, useReducer, useRef, type ReactNode } from "react";
import type { PanelContext } from "./types";
import { PanelContextHandle } from "./handle";
import { INITIAL_PANEL_CONTEXT, panelContextReducer } from "./reducer";

export function PanelContextProvider(props: { children: ReactNode; initial?: PanelContext }) {
  const [context, dispatch] = useReducer(panelContextReducer, props.initial ?? INITIAL_PANEL_CONTEXT);
  const latest = useRef(context);
  latest.current = context;
  const read = useCallback(() => latest.current, []);
  const value = useMemo(() => ({ context, dispatch, read }), [context, dispatch, read]);
  return <PanelContextHandle.Provider value={value}>{props.children}</PanelContextHandle.Provider>;
}
