import { expect, it } from "vitest";
import type { RecordingTargetPolicy, RecordingTargetPolicyBinding } from "../../../../runtime/recording/target-policy/index.ts";
import { decodeRecordingEntry, isOpaqueRecordingTarget, RecordingIngressShapes as S } from "../../decoding/index.ts";
import { domainRecordingIngress, type RecordingIngressPolicy } from "../index.ts";
import type { JsonObject } from "../../../../core/index.ts";

function fixture() {
  const calls: { receiver: unknown; method: string; args: unknown[] }[] = [];
  const target = { type: "domain-entity", metadata: { identity: "original" } };
  const entry = { type: "action" as const, actionType: "domain.change", parameters: { source: "original" }, target, origin: "operator" as const, startedAt: 1 };
  const base: RecordingIngressPolicy<unknown, JsonObject> = {
    entry(value) {
      calls.push({ receiver: this, method: "decode", args: [value] });
      return decodeRecordingEntry(value, { target: isOpaqueRecordingTarget, evidence: S.jsonObject });
    },
    commandTarget(value) { return { type: "unscoped", metadata: value }; },
    initialState(value) {
      calls.push({ receiver: this, method: "state", args: [value] });
      return { timestamp: 1, namespaces: {} };
    }
  };
  const policy: RecordingTargetPolicy = {
    accepts(value): value is unknown {
      calls.push({ receiver: this, method: "accepts", args: [value] });
      return value === target;
    },
    commandTarget(value) {
      calls.push({ receiver: this, method: "command", args: [value] });
      return target;
    },
    targetIssues(value, path) {
      calls.push({ receiver: this, method: "target", args: [value, path] });
      return [];
    },
    parameterIssues(value, path) {
      calls.push({ receiver: this, method: "parameters", args: [value, path] });
      return [];
    }
  };
  const binding = (): RecordingTargetPolicyBinding => ({ receiver: policy, accepts: policy.accepts, commandTarget: policy.commandTarget, targetIssues: policy.targetIssues, parameterIssues: policy.parameterIssues });
  return { calls, target, entry, base, policy, binding };
}

it("refuses a missing required policy before decoding and preserves the original unscoped policy", () => {
  const f = fixture();
  expect(() => domainRecordingIngress(f.base, undefined, true)).toThrow("recording.target_policy_missing");
  expect(f.calls).toEqual([]);
  expect(domainRecordingIngress(f.base, undefined, false)).toBe(f.base);
});

it("validates the original raw envelope and parameters with every original receiver and tuple", () => {
  const f = fixture();
  const ingress = domainRecordingIngress(f.base, f.binding(), true);
  expect(ingress.entry(f.entry)).toBe(f.entry);
  expect(f.calls).toEqual([
    { receiver: f.base, method: "decode", args: [f.entry] },
    { receiver: f.policy, method: "parameters", args: [f.entry.parameters, "parameters"] },
    { receiver: f.policy, method: "accepts", args: [f.target] },
    { receiver: f.policy, method: "target", args: [f.target, "target"] }
  ]);
});

it("retains warnings but refuses raw domain errors before a normalizer can remove them", () => {
  const f = fixture();
  f.policy.parameterIssues = () => [{ severity: "warning", code: "domain.warning", message: "Retained warning", path: "parameters" }];
  expect(domainRecordingIngress(f.base, f.binding(), true).entry(f.entry)).toBe(f.entry);
  f.policy.targetIssues = () => [{ severity: "error", code: "domain.invalid", message: "Raw target invalid", path: "target" }];
  expect(() => domainRecordingIngress(f.base, f.binding(), true).entry(f.entry)).toThrow("recording.invalid_entry");
  f.policy.targetIssues = () => [];
  f.policy.parameterIssues = () => [{ severity: "error", code: "domain.invalid_parameter", message: "Raw parameter invalid", path: "parameters" }];
  expect(() => domainRecordingIngress(f.base, f.binding(), true).entry(f.entry)).toThrow("recording.invalid_entry");
});

it("rejects the original false target guard and preserves an original domain callback failure", () => {
  const f = fixture();
  f.policy.accepts = (value): value is unknown => false;
  expect(() => domainRecordingIngress(f.base, f.binding(), true).entry(f.entry)).toThrow("recording.invalid_entry");
  const failure = new Error("original domain read failed");
  f.policy.parameterIssues = () => { throw failure; };
  expect(() => domainRecordingIngress(f.base, f.binding(), true).entry(f.entry)).toThrow(failure);
});

it("uses the original command target codec and leaves state checks with the original base", () => {
  const f = fixture();
  const ingress = domainRecordingIngress(f.base, f.binding(), true);
  const command = { original: "command" };
  expect(ingress.commandTarget(command)).toBe(f.target);
  expect(f.calls[0]).toEqual({ receiver: f.policy, method: "command", args: [command] });
  const state = { timestamp: 1, namespaces: {} };
  expect(ingress.initialState(state)).toEqual(state);
  expect(f.calls.at(-1)).toEqual({ receiver: f.base, method: "state", args: [state] });
});

it("keeps strict shared result/evidence decoding ahead of domain validation", () => {
  const f = fixture();
  const ingress = domainRecordingIngress(f.base, f.binding(), true);
  expect(() => ingress.entry({ ...f.entry, result: { status: "invented", evidence: [] } })).toThrow("recording.invalid_entry");
  expect(f.calls.map(call => call.method)).toEqual(["decode"]);
  const marker = { type: "marker" as const, label: "passive" };
  expect(ingress.entry(marker)).toBe(marker);
  expect(f.calls.map(call => call.method)).toEqual(["decode", "decode"]);
});
