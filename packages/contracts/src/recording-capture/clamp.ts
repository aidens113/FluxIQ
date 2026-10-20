import type {
  AutomationStudioRecordingCapturePolicy,
  AutomationStudioRecordingCaptureSettings,
  AutomationStudioRecordingCaptureSwitchPolicy,
  AutomationStudioRequestedRecordingCaptureSettings
} from "./policy.ts";

/**
 * The capture settings a client actually uses, given what was asked for and
 * Core's policy. A switch the policy forbids is off whatever was asked; an
 * allowed switch is what was asked, or the policy's default when nothing (or
 * no boolean) was. Direct requests are on only when the policy allows them and
 * they were asked for with `true`.
 */
export function clampAutomationStudioRecordingCaptureSettings(
  requested: AutomationStudioRequestedRecordingCaptureSettings,
  policy: AutomationStudioRecordingCapturePolicy
): AutomationStudioRecordingCaptureSettings {
  return {
    captureInputValues: clampSwitch(requested.captureInputValues, policy.captureInputValues),
    captureSnapshots: clampSwitch(requested.captureSnapshots, policy.captureSnapshots),
    captureMutations: clampSwitch(requested.captureMutations, policy.captureMutations),
    directRequests: policy.directRequests.allowed === true && requested.directRequests === true
  };
}

function clampSwitch(requested: unknown, policy: AutomationStudioRecordingCaptureSwitchPolicy): boolean {
  if (policy.allowed !== true) return false;
  return typeof requested === "boolean" ? requested : policy.default === true;
}
