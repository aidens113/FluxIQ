"use client";

import { useCallback, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { sharedPanelChanges, type PanelChangesPort } from "../../panel-changes";
import type { PanelContext } from "./types";
import { browserCoreContextPort, type CoreContextPort } from "./core-context";
import { PanelContextHandle } from "./handle";
import { INITIAL_PANEL_CONTEXT, panelContextReducer } from "./reducer";
import { useRestoredProject } from "./use-restored-project";

/**
 * `core` is where the person's current project is kept in Core, this browser's own session when absent;
 * `changes` is the stream that says a client switched it, the page's shared one when absent.
 */
export function PanelContextProvider(props: { children: ReactNode; initial?: PanelContext; core?: CoreContextPort; changes?: PanelChangesPort }) {
  const [context, dispatch] = useReducer(panelContextReducer, props.initial ?? INITIAL_PANEL_CONTEXT);
  const latest = useRef(context);
  latest.current = context;
  const [fallbackCore] = useState(browserCoreContextPort);
  useRestoredProject(context.projectId, context.flowId, dispatch, props.core ?? fallbackCore, props.changes ?? sharedPanelChanges());
  const read = useCallback(() => latest.current, []);
  const value = useMemo(() => ({ context, dispatch, read }), [context, dispatch, read]);
  return <PanelContextHandle.Provider value={value}>{props.children}</PanelContextHandle.Provider>;
}
