import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioImporterImplementationBundle, AutomationStudioImporterSdkManifest } from "../../../components/automation/importer/index.ts";
import { ExecutionCallbackPolicies } from "../../execution-observation/policies/index.ts";
import { createElementMatcher } from "../../target-matching/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../index.ts";
import { NativeTargetPreparationRegistry } from "../target-preparation/index.ts";

const manifest = (packageId = "package.actual", domainId = "domain.actual"): AutomationStudioImporterSdkManifest => ({ schemaVersion: "0.1", sdkVersion: "0.1", packageId, packageVersion: "1.0.0", domainId, nodes: [] });
const bundle = (packageId = "package.actual"): AutomationStudioImporterImplementationBundle => ({ packageId, packageVersion: "1.0.0", implementations: {} });
const input = { action: { actionType: "actual", outputId: "output.actual", parameters: {} }, domainId: "domain.actual", output: { id: "output.actual", title: "Actual output" } };
const entry = { type: "action" as const, actionType: "actual", parameters: {}, origin: "operator" as const, startedAt: 1 };

describe("original domain target preparer bindings", () => {
  it("keeps absent hooks absent despite the deprecated default matcher or other domains", () => {
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), bundle());
    expect(runtime.elementMatcher).toBeDefined();
    expect(runtime.targetPreparation.output("domain.actual")).toBeUndefined();
    expect(runtime.targetPreparation.recording("domain.actual")).toBeUndefined();
    expect(runtime.targetPreparation.output("other.domain")).toBeUndefined();
    expect(Object.isFrozen(runtime.targetPreparation)).toBe(true);
  });

  it("retains the exact original functions and original bundle receiver across later mutation", () => {
    const original = bundle();
    const output: NonNullable<typeof original.outputTargetPreparer> = function(this: unknown, actual) {
      expect(this).toBe(original);
      expect(actual).toBe(input);
      return { ok: true, parameters: { original: true } };
    };
    const recording: NonNullable<typeof original.recordingEntryTargetPreparer> = function(this: unknown, domainId, actual) {
      expect(this).toBe(original);
      expect(domainId).toBe("domain.actual");
      expect(actual).toBe(entry);
      return { parameters: { original: true } };
    };
    original.outputTargetPreparer = output;
    original.recordingEntryTargetPreparer = recording;
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), original);
    const outputBinding = runtime.targetPreparation.output("domain.actual")!;
    const recordingBinding = runtime.targetPreparation.recording("domain.actual")!;
    original.outputTargetPreparer = vi.fn(() => ({ ok: true as const }));
    original.recordingEntryTargetPreparer = vi.fn(() => null);
    expect(outputBinding).toEqual({ receiver: original, callback: output });
    expect(recordingBinding).toEqual({ receiver: original, callback: recording });
    expect(Object.isFrozen(outputBinding)).toBe(true);
    expect(outputBinding.callback.call(outputBinding.receiver, input)).toEqual({ ok: true, parameters: { original: true } });
    expect(recordingBinding.callback.call(recordingBinding.receiver, "domain.actual", entry)).toEqual({ parameters: { original: true } });
    expect(runtime.targetPreparation.output("domain.actual")).toBe(outputBinding);
    expect(original.outputTargetPreparer).not.toHaveBeenCalled();
    expect(original.recordingEntryTargetPreparer).not.toHaveBeenCalled();
  });

  it.each(["outputTargetPreparer", "recordingEntryTargetPreparer"] as const)("rejects malformed %s before SDK, matcher or either target hook mutates", field => {
    const original = bundle();
    original.outputTargetPreparer = () => ({ ok: true });
    original.recordingEntryTargetPreparer = () => null;
    original.elementMatcher = createElementMatcher();
    Object.defineProperty(original, field, { value: "not a function" });
    const runtime = new AutomationStudioNativeNodeRuntime();
    expect(() => runtime.register(manifest(), original)).toThrow("must be a function");
    expect(runtime.sdk.list()).toEqual([]);
    expect(runtime.getElementMatcher("domain.actual")).toBeUndefined();
    expect(runtime.targetPreparation.output("domain.actual")).toBeUndefined();
    expect(runtime.targetPreparation.recording("domain.actual")).toBeUndefined();
  });

  it.each(["outputTargetPreparer", "recordingEntryTargetPreparer"] as const)("refuses a changed original %s function before any SDK mutation", field => {
    const original = bundle();
    original.outputTargetPreparer = () => ({ ok: true });
    original.recordingEntryTargetPreparer = () => null;
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), original);
    const first = runtime.targetPreparation.output("domain.actual");
    const second = runtime.targetPreparation.recording("domain.actual");
    if (field === "outputTargetPreparer") original.outputTargetPreparer = () => ({ ok: true });
    else original.recordingEntryTargetPreparer = () => null;
    expect(() => runtime.register(manifest(), original)).toThrow("function or receiver");
    expect(runtime.sdk.list()).toHaveLength(1);
    expect(runtime.targetPreparation.output("domain.actual")).toBe(first);
    expect(runtime.targetPreparation.recording("domain.actual")).toBe(second);
  });

  it("denies a different receiver with the same hook and never borrows a hook for another domain", () => {
    const original = bundle();
    original.outputTargetPreparer = () => ({ ok: true });
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), original);
    const other = bundle("package.other");
    other.outputTargetPreparer = original.outputTargetPreparer;
    other.elementMatcher = createElementMatcher();
    expect(() => runtime.register(manifest("package.other"), other)).toThrow("receiver");
    expect(runtime.sdk.get("package.other")).toBeUndefined();
    expect(runtime.getElementMatcher("domain.actual")).toBeUndefined();
    expect(runtime.targetPreparation.output("other.domain")).toBeUndefined();
    runtime.register(manifest("package.other", "other.domain"), other);
    expect(runtime.targetPreparation.output("other.domain")?.receiver).toBe(other);
    expect(runtime.targetPreparation.output("domain.actual")?.receiver).toBe(original);
  });

  it("keeps exact original collaborator pairs idempotent without changing duplicate-package policy", () => {
    const original = bundle();
    original.outputTargetPreparer = () => ({ ok: true });
    original.recordingEntryTargetPreparer = () => null;
    const registry = new NativeTargetPreparationRegistry();
    const commit = registry.prepare("domain.actual", original);
    expect(registry.reader.output("domain.actual")).toBeUndefined();
    commit();
    const first = registry.reader.output("domain.actual");
    commit();
    registry.prepare("domain.actual", original)();
    expect(registry.reader.output("domain.actual")).toBe(first);
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), original);
    expect(() => runtime.register(manifest(), original)).toThrow("already registered");
  });

  it("does not install hooks when the original SDK checks reject, or declare custom hooks pure", () => {
    const original = bundle();
    const hook = () => ({ ok: true as const });
    original.outputTargetPreparer = hook;
    const invalid = { ...manifest(), sdkVersion: "foreign" } as unknown as AutomationStudioImporterSdkManifest;
    const runtime = new AutomationStudioNativeNodeRuntime();
    expect(() => runtime.register(invalid, original)).toThrow("version_mismatch");
    expect(runtime.targetPreparation.output("domain.actual")).toBeUndefined();
    runtime.register(manifest(), original);
    expect(ExecutionCallbackPolicies.isPure(original, hook)).toBe(false);
    expect(ExecutionCallbackPolicies.isOwningFrame(original, hook)).toBe(false);
  });

  it("preserves a callback's original thrown error without wrapping it", () => {
    const primary = new Error("original domain preparation error");
    const original = bundle();
    original.outputTargetPreparer = () => { throw primary; };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest(), original);
    const binding = runtime.targetPreparation.output("domain.actual")!;
    let observed: unknown;
    try { binding.callback.call(binding.receiver, input); }
    catch (error) { observed = error; }
    expect(observed).toBe(primary);
  });
});
