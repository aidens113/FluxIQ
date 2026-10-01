"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingLiveView, type OnboardingStartOptionId } from "../../features/automation-studio/onboarding";

/**
 * The onboarding view on the live client-gateway and Secret Keys snapshots.
 * Each choice opens Studio's guided journey; the person chooses a project and
 * explicitly opens the next step there. The Studio route validates domain scope.
 */
export function GetStartedClient(props: { pollMs?: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const onStart = (option: OnboardingStartOptionId) => {
    const params = new URLSearchParams({ start: option });
    const domainId = searchParams.get("domainId");
    if (domainId) params.set("domainId", domainId);
    router.push(`/programs/automation-studio?${params}`);
  };
  return <OnboardingLiveView onStart={onStart} {...(props.pollMs === undefined ? {} : { pollMs: props.pollMs })} />;
}
