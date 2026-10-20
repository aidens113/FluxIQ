// What a recording client may capture, and whether it may send direct
// requests, as Core decides it (t728, extension-core boundary audit finding 7).
// The client used to decide this alone: the extension held the capture
// switches and hard-coded requests off, and the web domain kept its own
// request default, with no Core counterpart. Core now owns the policy; a client
// reads it, offers the person only what it allows, and clamps what it uses with
// `clampAutomationStudioRecordingCaptureSettings`.

/** One capture switch: whether a client may turn it on, and its state when the person has not chosen. */
export type AutomationStudioRecordingCaptureSwitchPolicy = {
  allowed: boolean;
  default: boolean;
};

/**
 * The recording-capture and direct-request policy for a project.
 *
 * - `captureInputValues`: record the values typed into fields.
 * - `captureSnapshots`: record page snapshots beside the captured steps.
 * - `captureMutations`: record page changes between steps.
 * - `directRequests`: let a Flow send requests to a site directly rather than
 *   only through the page. There is no default: it is on only when allowed and
 *   asked for.
 */
export type AutomationStudioRecordingCapturePolicy = {
  captureInputValues: AutomationStudioRecordingCaptureSwitchPolicy;
  captureSnapshots: AutomationStudioRecordingCaptureSwitchPolicy;
  captureMutations: AutomationStudioRecordingCaptureSwitchPolicy;
  directRequests: { allowed: boolean };
};

/** The capture settings a client uses: every switch decided. */
export type AutomationStudioRecordingCaptureSettings = {
  captureInputValues: boolean;
  captureSnapshots: boolean;
  captureMutations: boolean;
  directRequests: boolean;
};

/** What a client or person asked for; a switch left out takes the policy's default. */
export type AutomationStudioRequestedRecordingCaptureSettings = Partial<AutomationStudioRecordingCaptureSettings>;
