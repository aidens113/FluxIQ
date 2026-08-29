"use client";

import { useRef } from "react";
import { defaultAutomationWorkspacePrefs } from "../workspace/layout";
import { createAutomationWorkspaceRenderStore } from "../workspace/render-store";
import { createAutomationStudioUiStore } from "../workspace/studio-ui-store";
import { createAutomationStudioStores } from "./studio-stores";

export function useAutomationStudioStoreOwners() {
  const storesRef = useRef<ReturnType<typeof createAutomationStudioStores> | null>(null);
  const uiRef = useRef<ReturnType<typeof createAutomationStudioUiStore> | null>(null);
  const workspaceRef = useRef<ReturnType<typeof createAutomationWorkspaceRenderStore> | null>(null);
  if (!storesRef.current) storesRef.current = createAutomationStudioStores();
  if (!uiRef.current) uiRef.current = createAutomationStudioUiStore();
  if (!workspaceRef.current) workspaceRef.current = createAutomationWorkspaceRenderStore(defaultAutomationWorkspacePrefs());
  return {
    studioStores: storesRef.current,
    studioUiStore: uiRef.current,
    workspaceRenderStore: workspaceRef.current
  };
}
