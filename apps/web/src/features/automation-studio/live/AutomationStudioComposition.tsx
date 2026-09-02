"use client";

import { useEffect } from "react";
import type { CurrentUser } from "../../programs/types";
import { useUiLongTaskMetrics, useUiRenderMetric } from "../../programs/ui-performance";
import { useAutomationStudioRuntime } from "../bootstrap/useAutomationStudioRuntime";
import { useAutomationStudioDevelopmentTelemetry } from "../development/telemetry";
import { AutomationStudioSession } from "./AutomationStudioSession";
import { scheduleAutomationViewSurfacePreload } from "../views/view-surface-preloader";

export function AutomationStudioComposition(props: { currentUser: CurrentUser }) {
  useUiRenderMetric("AutomationStudioLive");
  useUiLongTaskMetrics("AutomationStudio");
  useAutomationStudioDevelopmentTelemetry();
  const runtime = useAutomationStudioRuntime();
  useEffect(() => scheduleAutomationViewSurfacePreload(["flow-nodes"]), []);

  return <AutomationStudioSession currentUser={props.currentUser} runtime={runtime} />;
}
