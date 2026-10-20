// Core's recording-capture and direct-request policy, re-exported by name so
// the extension and the web domain decide what a recording captures, and
// whether a Flow may send direct requests, with Core's policy and clamp rather
// than defaults of their own (t728, lane S; audit finding 7). Browser code
// reaches `@fluxiq/contracts` only through `fluxiq` subpaths, and this one is
// browser-safe: never route these through the `fluxiq/automation-studio`
// barrel, which pulls in `node:crypto`.
export {
  AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY,
  clampAutomationStudioRecordingCaptureSettings
} from "@fluxiq/contracts/automation-studio";
export type {
  AutomationStudioRecordingCapturePolicy,
  AutomationStudioRecordingCaptureSettings,
  AutomationStudioRecordingCaptureSwitchPolicy,
  AutomationStudioRequestedRecordingCaptureSettings
} from "@fluxiq/contracts/automation-studio";
