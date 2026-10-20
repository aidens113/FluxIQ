import type { AutomationStudioRecordingCapturePolicy } from "./policy.ts";

/**
 * Core's recording-capture policy where nothing narrower is set: every capture
 * switch allowed and on by default, direct requests not allowed. It is the
 * behaviour the extension and the web domain had before Core owned the policy
 * (all three switches on, requests off), so adopting it changes nothing.
 */
export const AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY: Readonly<AutomationStudioRecordingCapturePolicy> = Object.freeze({
  captureInputValues: Object.freeze({ allowed: true, default: true }),
  captureSnapshots: Object.freeze({ allowed: true, default: true }),
  captureMutations: Object.freeze({ allowed: true, default: true }),
  directRequests: Object.freeze({ allowed: false })
});
