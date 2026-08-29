"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseAutomationStudioDeepLink } from "../navigation";

export function useAutomationBrowserEntry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchSignature = searchParams.toString();
  const deepLink = useMemo(
    () => parseAutomationStudioDeepLink(new URLSearchParams(searchSignature)),
    [searchSignature]
  );

  return { deepLink, pathname, searchSignature };
}