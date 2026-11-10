"use client";

// A page tells the panel where the person is and what they picked, by rendering
// this. It draws nothing. The selection is compared by value, so a page that
// builds a new object on each render does not publish on each render.

import { useEffect } from "react";
import type { PanelPage, PanelSelection } from "./types";
import { usePanelContext } from "./use-panel-context";

export function PublishPanelPage(props: { page: PanelPage; selection?: PanelSelection }) {
  const { dispatch } = usePanelContext();
  const key = JSON.stringify(props.selection ?? {});
  useEffect(() => {
    const selection = JSON.parse(key) as PanelSelection;
    dispatch({ type: "publish", page: props.page, selection });
  }, [dispatch, props.page, key]);
  return null;
}
