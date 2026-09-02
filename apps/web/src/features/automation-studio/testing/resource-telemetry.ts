type Phase8ResourceTelemetryWindow = Window & {
  __FLUXIQ_ENABLE_PHASE8_RESOURCE_TELEMETRY__?: boolean;
  __fluxiqPhase8Resources?: { subscriptions: number; peakSubscriptions: number };
};

export function trackAutomationSubscription(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const owner = window as Phase8ResourceTelemetryWindow;
  if (!owner.__FLUXIQ_ENABLE_PHASE8_RESOURCE_TELEMETRY__) return () => undefined;
  const resources = owner.__fluxiqPhase8Resources ??= { subscriptions: 0, peakSubscriptions: 0 };
  resources.subscriptions += 1;
  resources.peakSubscriptions = Math.max(resources.peakSubscriptions, resources.subscriptions);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    resources.subscriptions = Math.max(0, resources.subscriptions - 1);
  };
}
