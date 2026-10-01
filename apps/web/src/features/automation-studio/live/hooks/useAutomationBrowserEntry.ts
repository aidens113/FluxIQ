"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { parseAutomationStudioDeepLink } from "../../navigation";
import { replaceAutomationStudioBrowserUrl } from "../../model/live-helpers";
import type { OnboardingStartOptionId } from "../../onboarding";

export function useAutomationBrowserEntry() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchSignature = searchParams.toString();
  const deepLink = useMemo(
    () => parseAutomationStudioDeepLink(new URLSearchParams(searchSignature)),
    [searchSignature]
  );
  const scopeKey = `${pathname}?${searchSignature}`;
  const scopeRef = useRef({ key: scopeKey, generation: 0 });
  if (scopeRef.current.key !== scopeKey) scopeRef.current = { key: scopeKey, generation: scopeRef.current.generation + 1 };
  const scope = scopeRef.current;
  const mounted = useRef(false);
  const consumed = useRef<number | null>(null);
  const [consumedGeneration, setConsumedGeneration] = useState<number | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const choice = startChoice(new URLSearchParams(searchSignature));
  // An explicit workspace target wins over optional onboarding guidance. Its
  // asynchronous restoration owner deliberately stays the only navigator.
  const canonicalTarget = Boolean(deepLink.flowId || deepLink.subflowId || deepLink.viewId || deepLink.detail);
  const startIntent = canonicalTarget || consumedGeneration === scope.generation ? null : choice;
  const consumeStartIntent = useCallback(() => {
    if (!mounted.current || !choice || canonicalTarget || scopeRef.current !== scope || consumed.current === scope.generation || typeof window === "undefined") return false;
    const current = new URLSearchParams(window.location.search);
    if (window.location.pathname !== pathname || current.toString() !== searchSignature || startChoice(current) !== choice) return false;
    current.delete("start");
    replaceAutomationStudioBrowserUrl(pathname, current);
    consumed.current = scope.generation;
    setConsumedGeneration(scope.generation);
    return true;
  }, [canonicalTarget, choice, pathname, scope, searchSignature]);
  return { deepLink, pathname, searchSignature, startIntent, consumeStartIntent, domainId: new URLSearchParams(searchSignature).get("domainId") };
}

function startChoice(params: URLSearchParams): OnboardingStartOptionId | null {
  const values = params.getAll("start");
  const choice = values[0];
  return values.length === 1 && (choice === "describe" || choice === "demonstrate" || choice === "extract") ? choice : null;
}
