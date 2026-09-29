"use client";

import { OnboardingView, type OnboardingViewProps } from "./OnboardingView";
import { useOnboardingSources } from "./useOnboardingSources";

/** `OnboardingView` wired to the live client-gateway and Secret Keys snapshots. */
export function OnboardingLiveView(props: Omit<OnboardingViewProps, "sources">) {
  const sources = useOnboardingSources();
  return <OnboardingView {...props} sources={sources} />;
}
