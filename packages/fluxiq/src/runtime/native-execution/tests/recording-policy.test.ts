import { expect, it } from "vitest";
import type { AutomationStudioImporterImplementationBundle, AutomationStudioImporterSdkManifest } from "../../../components/automation/importer/index.ts";
import type { RecordingTargetPolicy } from "../../recording/target-policy/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../index.ts";

const manifest = (domainId = "actual.domain"): AutomationStudioImporterSdkManifest => ({ schemaVersion: "0.1", sdkVersion: "0.1", packageId: "actual.package", packageVersion: "1.0.0", domainId, nodes: [], recordingTargetPolicyRequired: true });
const policy = (): RecordingTargetPolicy => ({ accepts: (_value): _value is unknown => true, commandTarget: value => value, targetIssues: () => [], parameterIssues: () => [] });
const bundle = (): AutomationStudioImporterImplementationBundle => ({ packageId: "actual.package", packageVersion: "1.0.0", implementations: {} });

it("retains a registered policy requirement even when its implementation is absent", () => {
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), bundle());
  expect(runtime.targetPreparation.requiresRecordingPolicy("actual.domain")).toBe(true);
  expect(runtime.targetPreparation.policy("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.requiresRecordingPolicy("unregistered")).toBe(false);
});

it("leaves requirement, policy and both hook maps unchanged when the SDK rejects a duplicate package", () => {
  const first = manifest();
  delete first.recordingTargetPolicyRequired;
  const runtime = new AutomationStudioNativeNodeRuntime().register(first, bundle());
  const candidate = { ...bundle(), recordingTargetPolicy: policy(), outputTargetPreparer: () => ({ ok: true as const }), recordingEntryTargetPreparer: () => null };
  const duplicate = manifest();
  delete duplicate.recordingTargetPolicyRequired;
  expect(() => runtime.register(duplicate, candidate)).toThrow("already registered");
  expect(runtime.sdk.list()).toHaveLength(1);
  expect(runtime.targetPreparation.policy("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.output("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.recording("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.requiresRecordingPolicy("actual.domain")).toBe(false);
});

it("does not commit a required policy or hooks when the SDK rejects its version", () => {
  const runtime = new AutomationStudioNativeNodeRuntime();
  const invalid = Object.defineProperty(manifest(), "sdkVersion", { value: "foreign" });
  const candidate = { ...bundle(), recordingTargetPolicy: policy(), outputTargetPreparer: () => ({ ok: true as const }), recordingEntryTargetPreparer: () => null };
  expect(() => runtime.register(invalid, candidate)).toThrow("version_mismatch");
  expect(runtime.sdk.list()).toEqual([]);
  expect(runtime.targetPreparation.policy("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.output("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.recording("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.requiresRecordingPolicy("actual.domain")).toBe(false);
});

it("refuses a manifest requirement accessor before SDK mutation without running it", () => {
  const runtime = new AutomationStudioNativeNodeRuntime();
  const original = manifest();
  let getters = 0;
  Object.defineProperty(original, "recordingTargetPolicyRequired", { get() {
    getters++;
    return true;
  } });
  expect(() => runtime.register(original, { ...bundle(), recordingTargetPolicy: policy() })).toThrow("own data property");
  expect(getters).toBe(0);
  expect(runtime.sdk.list()).toEqual([]);
  expect(runtime.targetPreparation.policy("actual.domain")).toBeUndefined();
  expect(runtime.targetPreparation.requiresRecordingPolicy("actual.domain")).toBe(false);
});

it("does not give a supplied policy a pure or managed callback contract", () => {
  const original = policy();
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), { ...bundle(), recordingTargetPolicy: original });
  const binding = runtime.targetPreparation.policy("actual.domain")!;
  expect(binding.receiver).toBe(original);
  for (const key of ["accepts", "commandTarget", "targetIssues", "parameterIssues"] as const) {
    expect(binding[key]).toBe(original[key]);
    expect(ExecutionCallbackPolicies.isPure(original, original[key])).toBe(false);
    expect(ExecutionCallbackPolicies.isOwningFrame(original, original[key])).toBe(false);
  }
});
