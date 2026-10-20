// Core's recording-capture and direct-request policy (t728, lane S; audit
// finding 7): what a recording client may capture and whether it may send
// direct requests, decided by Core and clamped by one function every client
// shares instead of each holding its own defaults.
import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY,
  clampAutomationStudioRecordingCaptureSettings,
  type AutomationStudioRecordingCapturePolicy
} from "../index.ts";
import * as automationStudio from "../../automation-studio.ts";

const ALL_ON = { captureInputValues: true, captureSnapshots: true, captureMutations: true, directRequests: true };

describe("the default recording-capture policy", () => {
  it("allows every capture switch, on by default, and does not allow direct requests", () => {
    expect(AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY).toEqual({
      captureInputValues: { allowed: true, default: true },
      captureSnapshots: { allowed: true, default: true },
      captureMutations: { allowed: true, default: true },
      directRequests: { allowed: false }
    });
  });

  it("cannot be changed by a reader", () => {
    expect(Object.isFrozen(AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY)).toBe(true);
    expect(Object.isFrozen(AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY.captureInputValues)).toBe(true);
    expect(Object.isFrozen(AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY.directRequests)).toBe(true);
  });

  it("is published on the automation-studio subpath", () => {
    expect(automationStudio.AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY).toBe(AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY);
    expect(automationStudio.clampAutomationStudioRecordingCaptureSettings).toBe(clampAutomationStudioRecordingCaptureSettings);
  });
});

describe("clamping requested capture settings to a policy", () => {
  it("gives today's behaviour under the default policy when nothing is requested", () => {
    expect(clampAutomationStudioRecordingCaptureSettings({}, AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY)).toEqual({
      captureInputValues: true,
      captureSnapshots: true,
      captureMutations: true,
      directRequests: false
    });
  });

  it("keeps a switch the person turned off, off", () => {
    const settings = clampAutomationStudioRecordingCaptureSettings({ captureInputValues: false, captureMutations: false }, AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY);
    expect(settings).toEqual({ captureInputValues: false, captureSnapshots: true, captureMutations: false, directRequests: false });
  });

  it("refuses direct requests the policy does not allow, even when asked for", () => {
    expect(clampAutomationStudioRecordingCaptureSettings(ALL_ON, AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY).directRequests).toBe(false);
  });

  it("turns off every switch the policy forbids, whatever was requested", () => {
    const strict: AutomationStudioRecordingCapturePolicy = {
      captureInputValues: { allowed: false, default: true },
      captureSnapshots: { allowed: false, default: false },
      captureMutations: { allowed: true, default: false },
      directRequests: { allowed: false }
    };
    expect(clampAutomationStudioRecordingCaptureSettings(ALL_ON, strict)).toEqual({
      captureInputValues: false,
      captureSnapshots: false,
      captureMutations: true,
      directRequests: false
    });
    expect(clampAutomationStudioRecordingCaptureSettings({}, strict).captureMutations).toBe(false);
  });

  it("turns direct requests on only when they are both allowed and asked for", () => {
    const open: AutomationStudioRecordingCapturePolicy = { ...AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY, directRequests: { allowed: true } };
    expect(clampAutomationStudioRecordingCaptureSettings({ directRequests: true }, open).directRequests).toBe(true);
    expect(clampAutomationStudioRecordingCaptureSettings({}, open).directRequests).toBe(false);
    expect(clampAutomationStudioRecordingCaptureSettings({ directRequests: false }, open).directRequests).toBe(false);
  });

  it("reads a value that is not a boolean as not requested", () => {
    const settings = clampAutomationStudioRecordingCaptureSettings(
      { captureInputValues: "no", directRequests: "yes" } as unknown as Parameters<typeof clampAutomationStudioRecordingCaptureSettings>[0],
      { ...AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY, directRequests: { allowed: true } }
    );
    expect(settings.captureInputValues).toBe(true);
    expect(settings.directRequests).toBe(false);
  });
});
