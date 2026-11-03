import { expect, it, vi } from "vitest";
import { IoRegistry, defineOutput } from "../../../../../../io/index.ts";
import { createAutomationGraphOptions } from "../../../../../../engine/automation/integration/index.ts";
import { AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../../../../../../runtime/environment/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../../runtime/native-execution/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION } from "../../../../../../components/automation/importer/index.ts";
import { createElementMatcher } from "../../../../../../runtime/target-matching/index.ts";
import { matchOutputTarget, type OutputTargetPreparer } from "../../../../../../runtime/output-dispatch/preparation/index.ts";
import { automationStudioRunGraphOptions } from "../graph-options.ts";
it("delegates environment assembly without changing signal, input or callback identity", () => {
  const signal = new AbortController().signal;
  const inputs = { query: "lamps" };
  const onRecordBatch = async () => {
    throw new Error("unexpected record batch");
  };
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(123) });
  const input = { signal, inputs, onRecordBatch, environment, authorizedDomainIds: ["device"], referenceNow: 1, maxSteps: 7 };
  const legacy = automationStudioRunGraphOptions(input);
  expect(legacy).toEqual(createAutomationGraphOptions(input));
  expect(legacy.signal).toBe(signal);
  expect(legacy.inputs).toBe(inputs);
  expect(legacy.onRecordBatch).toBe(onRecordBatch);
});
it("requires the registered domain hook when the registered output requires preparation", async () => {
  const io = new IoRegistry();
  const dispatch = vi.fn(() => ({ ok: true, outputId: "device.set" }));
  io.registerOutput("device", defineOutput({ definition: { id: "device.set", title: "Set device", metadata: { outputTargetPreparationRequired: true } }, mode: "request", dispatch }));
  const input = { signal: new AbortController().signal, authorizedDomainIds: ["device"], io: { io, domainId: "device" } };
  const effect = { type: "policy.output.dispatch", payload: { outputId: "device.set", parameters: {} } };
  expect(await createAutomationGraphOptions(input).effectDispatcher?.(effect)).toMatchObject({ status: "failed", failure: { code: "output.target_preparer_missing" } });
  expect(await automationStudioRunGraphOptions(input).effectDispatcher?.(effect)).toMatchObject({ status: "failed", failure: { code: "output.target_preparer_missing" } });
  expect(dispatch).not.toHaveBeenCalled();
});
it("uses only the bound domain's original registered callback and receiver", async () => {
  const matcher = createElementMatcher();
  const score = vi.spyOn(matcher, "bestCandidate");
  const fingerprint = { entityId: "wanted" };
  const candidates = [{ candidateId: "wanted", entityId: "wanted" }];
  const parameters = { target: { kind: "element", fingerprint, candidates } };
  const receivers: unknown[] = [];
  const prepare: OutputTargetPreparer = function (this: unknown, input) {
    receivers.push(this);
    expect(input.domainId).toBe("device");
    expect(input.action.parameters).toBe(parameters);
    return matchOutputTarget(fingerprint, candidates, 0.5, matcher);
  };
  const bundle = { packageId: "device.package", packageVersion: "1.0.0", implementations: {}, elementMatcher: matcher, outputTargetPreparer: prepare };
  const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, domainId: "device", packageId: "device.package", packageVersion: "1.0.0", nodes: [] }, bundle);
  const other = vi.fn(() => {
    throw new Error("another domain's hook was invoked");
  });
  native.register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, domainId: "other", packageId: "other.package", packageVersion: "1.0.0", nodes: [] }, { packageId: "other.package", packageVersion: "1.0.0", implementations: {}, outputTargetPreparer: other });
  const selected = vi.spyOn(native, "getElementMatcher");
  vi.spyOn(native.elementMatcher, "bestCandidate").mockImplementation(() => {
    throw new Error("deprecated matcher used");
  });
  const io = new IoRegistry();
  io.registerOutput("device", defineOutput({ definition: { id: "device.set", title: "Set device", metadata: { outputTargetPreparationRequired: true } }, mode: "request", dispatch: () => ({ ok: true, outputId: "device.set" }) }));
  const options = automationStudioRunGraphOptions({ signal: new AbortController().signal, authorizedDomainIds: ["device", "other"], io: { io, domainId: "device" }, nativeNodeRuntime: native });
  expect(selected).not.toHaveBeenCalled();
  expect(await options.effectDispatcher?.({ type: "policy.output.dispatch", payload: { outputId: "device.set", parameters } })).toMatchObject({ status: "success", targetResolution: { status: "matched", candidateId: "wanted" } });
  expect(score).toHaveBeenCalledTimes(1);
  expect(receivers).toEqual([bundle]);
  expect(native.targetPreparation.output("device")).toMatchObject({ receiver: bundle, callback: prepare });
  expect(other).not.toHaveBeenCalled();
});
