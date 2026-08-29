"use client";

import { useEffect, useMemo } from "react";
import type { ProgramCommandTransport } from "../data/program-transport";
import { AutomationHierarchyBrowserPaging } from "../hierarchy/browser-hierarchy-paging";
import { createAutomationHierarchyChildrenTransport } from "../hierarchy/browser-hierarchy-transport";

export function useAutomationHierarchyBrowserPaging(
  transport: Pick<ProgramCommandTransport, "post">
): AutomationHierarchyBrowserPaging {
  const paging = useMemo(
    () => new AutomationHierarchyBrowserPaging(createAutomationHierarchyChildrenTransport(transport)),
    [transport]
  );
  useEffect(() => () => paging.dispose(), [paging]);
  return paging;
}