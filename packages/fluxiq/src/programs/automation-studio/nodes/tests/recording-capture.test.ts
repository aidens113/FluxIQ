// Core's recording-capture policy re-exported for browser code (t728, lane S;
// audit finding 7): the extension and the web domain read the policy's types,
// its default and its clamp through the browser-safe
// `fluxiq/automation-studio/nodes` subpath, never through the
// `fluxiq/automation-studio` barrel, which pulls in `node:crypto`.
import * as contracts from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import * as nodes from "../index.ts";

describe("the recording-capture policy on the nodes subpath", () => {
  it("is Core's own default and clamp, not a copy", () => {
    expect(nodes.AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY).toBe(contracts.AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY);
    expect(nodes.clampAutomationStudioRecordingCaptureSettings).toBe(contracts.clampAutomationStudioRecordingCaptureSettings);
  });

  it("clamps a request for direct requests off under the default", () => {
    const settings = nodes.clampAutomationStudioRecordingCaptureSettings({ directRequests: true }, nodes.AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY);
    expect(settings).toEqual({ captureInputValues: true, captureSnapshots: true, captureMutations: true, directRequests: false });
  });
});
