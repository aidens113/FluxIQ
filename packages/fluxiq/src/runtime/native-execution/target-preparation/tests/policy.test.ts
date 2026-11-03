import { describe, expect, it } from "vitest";
import type { AutomationStudioImporterImplementationBundle } from "../../../../components/automation/importer/index.ts";
import type { RecordingTargetPolicy } from "../../../recording/target-policy/index.ts";
import { NativeTargetPreparationRegistry } from "../index.ts";

const methods = ["accepts", "commandTarget", "targetIssues", "parameterIssues"] as const;
const bundle = (): AutomationStudioImporterImplementationBundle => ({ packageId: "actual.package", packageVersion: "1", implementations: {} });
const policy = (): RecordingTargetPolicy => ({
  accepts: (_value): _value is unknown => true,
  commandTarget: value => value,
  targetIssues: () => [],
  parameterIssues: () => []
});

describe("atomic original recording policy registration", () => {
  it("stages the required declaration without inventing an implementation or borrowing another domain", () => {
    const registry = new NativeTargetPreparationRegistry();
    const commit = registry.prepare("required", bundle(), true);
    expect(registry.reader.requiresRecordingPolicy("required")).toBe(false);
    commit();
    expect(registry.reader.requiresRecordingPolicy("required")).toBe(true);
    expect(registry.reader.policy("required")).toBeUndefined();
    const other = { ...bundle(), recordingTargetPolicy: policy() };
    registry.prepare("other", other)();
    expect(registry.reader.policy("other")?.receiver).toBe(other.recordingTargetPolicy);
    expect(registry.reader.policy("required")).toBeUndefined();
    expect(registry.reader.requiresRecordingPolicy("other")).toBe(false);
    expect(registry.reader.requiresRecordingPolicy("unknown")).toBe(false);
  });

  it("pins all original methods and their exact policy receiver before later replacement", () => {
    const target = { type: "actual" };
    const parameters = { target };
    const calls: string[] = [];
    const original: RecordingTargetPolicy = {
      accepts(this: unknown, value): value is unknown {
        expect(this).toBe(original);
        expect(value).toBe(target);
        calls.push("accepts");
        return true;
      },
      commandTarget(this: unknown, value) {
        expect(this).toBe(original);
        expect(value).toBe(parameters);
        calls.push("commandTarget");
        return target;
      },
      targetIssues(this: unknown, value, path) {
        expect(this).toBe(original);
        expect(value).toBe(target);
        expect(path).toBe("actual.target");
        calls.push("targetIssues");
        return [];
      },
      parameterIssues(this: unknown, value, path) {
        expect(this).toBe(original);
        expect(value).toBe(parameters);
        expect(path).toBe("actual.parameters");
        calls.push("parameterIssues");
        return [];
      }
    };
    const callbacks = Object.fromEntries(methods.map(key => [key, original[key]]));
    const registry = new NativeTargetPreparationRegistry();
    registry.prepare("actual", { ...bundle(), recordingTargetPolicy: original }, true)();
    const binding = registry.reader.policy("actual")!;
    expect(Object.isFrozen(binding)).toBe(true);
    for (const method of methods) {
      expect(binding[method]).toBe(callbacks[method]);
      Object.defineProperty(original, method, { value: () => { throw new Error("replacement must not run"); } });
    }
    expect(binding.accepts.call(binding.receiver, target)).toBe(true);
    expect(binding.commandTarget.call(binding.receiver, parameters)).toBe(target);
    expect(binding.targetIssues.call(binding.receiver, target, "actual.target")).toEqual([]);
    expect(binding.parameterIssues.call(binding.receiver, parameters, "actual.parameters")).toEqual([]);
    expect(calls).toEqual([...methods]);
  });

  it.each(methods)("rejects an accessor for %s with zero getter calls and no partial hook maps", method => {
    const registry = new NativeTargetPreparationRegistry();
    const original = policy();
    let getters = 0;
    Object.defineProperty(original, method, { get() {
      getters++;
      throw new Error("getter must not run");
    } });
    const candidate = { ...bundle(), recordingTargetPolicy: original, outputTargetPreparer: () => ({ ok: true as const }), recordingEntryTargetPreparer: () => null };
    expect(() => registry.prepare("actual", candidate, true)).toThrow("own data property");
    expect(getters).toBe(0);
    expect(registry.reader.output("actual")).toBeUndefined();
    expect(registry.reader.recording("actual")).toBeUndefined();
    expect(registry.reader.policy("actual")).toBeUndefined();
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(false);
  });

  it.each(methods)("rejects a malformed %s, including the fourth method, before committing any map", method => {
    const registry = new NativeTargetPreparationRegistry();
    const original = policy();
    Object.defineProperty(original, method, { value: null });
    const candidate = { ...bundle(), recordingTargetPolicy: original, outputTargetPreparer: () => ({ ok: true as const }), recordingEntryTargetPreparer: () => null };
    expect(() => registry.prepare("actual", candidate, true)).toThrow("must be a function");
    expect(registry.reader.output("actual")).toBeUndefined();
    expect(registry.reader.recording("actual")).toBeUndefined();
    expect(registry.reader.policy("actual")).toBeUndefined();
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(false);
  });

  it.each(["outputTargetPreparer", "recordingEntryTargetPreparer", "recordingTargetPolicy"] as const)("never invokes an optional bundle %s accessor", key => {
    const registry = new NativeTargetPreparationRegistry();
    const original = bundle();
    let getters = 0;
    Object.defineProperty(original, key, { get() {
      getters++;
      return policy();
    } });
    expect(() => registry.prepare("actual", original, true)).toThrow("own data property");
    expect(getters).toBe(0);
    expect(registry.reader.policy("actual")).toBeUndefined();
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(false);
  });

  it.each(methods)("refuses changed %s while retaining both existing hook maps and the original binding", method => {
    const registry = new NativeTargetPreparationRegistry();
    const original = { ...bundle(), recordingTargetPolicy: policy(), outputTargetPreparer: () => ({ ok: true as const }), recordingEntryTargetPreparer: () => null };
    registry.prepare("actual", original, true)();
    const before = { policy: registry.reader.policy("actual"), output: registry.reader.output("actual"), recording: registry.reader.recording("actual") };
    Object.defineProperty(original.recordingTargetPolicy, method, { value: () => [] });
    expect(() => registry.prepare("actual", original, true)).toThrow("function or receiver");
    expect(registry.reader.policy("actual")).toBe(before.policy);
    expect(registry.reader.output("actual")).toBe(before.output);
    expect(registry.reader.recording("actual")).toBe(before.recording);
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(true);
  });

  it("rejects a different policy receiver with identical functions and keeps exact originals idempotent", () => {
    const registry = new NativeTargetPreparationRegistry();
    const original = { ...bundle(), recordingTargetPolicy: policy() };
    const commit = registry.prepare("actual", original, true);
    commit();
    const first = registry.reader.policy("actual");
    commit();
    registry.prepare("actual", original, true)();
    expect(registry.reader.policy("actual")).toBe(first);
    expect(() => registry.prepare("actual", { ...original, recordingTargetPolicy: { ...original.recordingTargetPolicy } }, true)).toThrow("receiver");
    expect(registry.reader.policy("actual")).toBe(first);
  });

  it.each([undefined, true] as const)("refuses changing the registered requirement %s atomically", required => {
    const registry = new NativeTargetPreparationRegistry();
    const original = bundle();
    registry.prepare("actual", original, required)();
    const next = { ...original, recordingTargetPolicy: policy(), outputTargetPreparer: () => ({ ok: true as const }) };
    expect(() => registry.prepare("actual", next, required ? undefined : true)).toThrow("requirement");
    expect(registry.reader.policy("actual")).toBeUndefined();
    expect(registry.reader.output("actual")).toBeUndefined();
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(required === true);
  });

  it("rejects inherited policy methods without invoking their getters", () => {
    const registry = new NativeTargetPreparationRegistry();
    let getters = 0;
    const prototype = Object.defineProperty({}, "accepts", { get() {
      getters++;
      return () => true;
    } });
    const inherited: RecordingTargetPolicy = Object.assign(Object.create(prototype), { commandTarget: (value: unknown) => value, targetIssues: () => [], parameterIssues: () => [] });
    expect(() => registry.prepare("actual", { ...bundle(), recordingTargetPolicy: inherited }, true)).toThrow("own data property");
    expect(getters).toBe(0);
    expect(registry.reader.requiresRecordingPolicy("actual")).toBe(false);
  });
});
