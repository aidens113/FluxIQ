"use client";

import type { CurrentUser } from "../../programs/types";
import { useUiLongTaskMetrics, useUiRenderMetric } from "../../programs/ui-performance";
import { useAutomationStudioRuntime } from "../bootstrap/useAutomationStudioRuntime";
import { useAutomationStudioDevelopmentTelemetry } from "../development/telemetry";
import { AutomationStudioSession } from "./AutomationStudioSession";

export function AutomationStudioComposition(props: { currentUser: CurrentUser }) {
  useUiRenderMetric("AutomationStudioLive");
  useUiLongTaskMetrics("AutomationStudio");
  useAutomationStudioDevelopmentTelemetry();
  const runtime = useAutomationStudioRuntime();

  return <AutomationStudioSession currentUser={props.currentUser} runtime={runtime} />;
}
