"use client";

import { useMemo } from "react";
import type { AutomationStudioUiCacheBackend } from "./contracts";
import { AutomationStudioUiCacheCoordinator } from "./coordinator";

export function useAutomationStudioUiCache(
  backend?: AutomationStudioUiCacheBackend
): AutomationStudioUiCacheCoordinator {
  return useMemo(() => new AutomationStudioUiCacheCoordinator(backend), [backend]);
}