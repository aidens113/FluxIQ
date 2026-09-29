"use client";

import { useRouter } from "next/navigation";
import { OnboardingLiveView, type OnboardingStartOptionId } from "../../features/automation-studio/onboarding";

/**
 * The onboarding view on the live client-gateway and Secret Keys snapshots.
 * Each start option opens Automation Studio; `start` names the option chosen
 * so Studio can open the matching flow once it reads the parameter (today it
 * does not, and simply opens).
 */
export function GetStartedClient(props: { pollMs?: number }) {
  const router = useRouter();
  const onStart = (option: OnboardingStartOptionId) => router.push(`/programs/automation-studio?start=${encodeURIComponent(option)}`);
  return <OnboardingLiveView onStart={onStart} {...(props.pollMs === undefined ? {} : { pollMs: props.pollMs })} />;
}
