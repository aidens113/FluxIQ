"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { OnboardingLiveView, type OnboardingStartOptionId } from "../../features/automation-studio/onboarding";

/**
 * The onboarding view on the live client-gateway and Secret Keys snapshots.
 * Each choice opens Studio's guided journey; the person chooses a project and
 * explicitly opens the next step there. The Studio route validates domain scope.
 */
export function GetStartedClient(props: { pollMs?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const ownerRef = useRef({ router, query });
  if (ownerRef.current.router !== router || ownerRef.current.query !== query) ownerRef.current = { router, query };
  const owner = ownerRef.current;
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const domainId = searchParams.get("domainId");
  const setupParams = new URLSearchParams();
  if (domainId) setupParams.set("domainId", domainId);
  const secretKeysHref = `/programs/secret-keys${setupParams.size ? `?${setupParams}` : ""}`;
  const onStart = (option: OnboardingStartOptionId) => {
    if (!mounted.current || ownerRef.current !== owner) return;
    const params = new URLSearchParams({ start: option });
    const domainId = searchParams.get("domainId");
    if (domainId) params.set("domainId", domainId);
    router.push(`/programs/automation-studio?${params}`);
  };
  return <OnboardingLiveView onStart={onStart} secretKeysHref={secretKeysHref} {...(props.pollMs === undefined ? {} : { pollMs: props.pollMs })} />;
}
