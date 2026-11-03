import type { AppendRecordingEntryInput } from "@fluxiq/contracts/recording";
import { expect, it, vi } from "vitest";
import { prepareRecordingEntryTargets } from "../index.ts";

function action(): Extract<AppendRecordingEntryInput, { type: "action" }> {
  return { id: "entry.original", type: "action", actionType: "device.set", outputId: "device.set", parameters: { original: true }, target: { opaque: true }, origin: "operator", startedAt: 1 };
}

it("leaves opaque entries identical without their original domain hook", () => {
  const entry = action();
  const callback = vi.fn(() => ({ parameters: {} }));
  expect(prepareRecordingEntryTargets([entry], undefined, { receiver: undefined, callback })[0]).toBe(entry);
  expect(prepareRecordingEntryTargets([entry], "device")[0]).toBe(entry);
  expect(callback).not.toHaveBeenCalled();
});

it("calls the original receiver and entry while ignoring returned identity and routing fields", () => {
  const entry = action();
  const projected = { parameters: { prepared: true }, target: { opaque: "prepared" }, id: "forged", outputId: "other.set", actionType: "other.set", type: "marker" };
  const receiver = {
    calls: 0,
    prepare(domainId: string, original: Readonly<typeof entry>) {
      this.calls++;
      expect(domainId).toBe("device");
      expect(original).toBe(entry);
      return projected;
    }
  };
  const [prepared] = prepareRecordingEntryTargets([entry], "device", { receiver, callback: receiver.prepare });
  expect(prepared).toEqual({ ...entry, parameters: projected.parameters, target: projected.target });
  expect(entry.parameters).toEqual({ original: true });
  expect(receiver.calls).toBe(1);
});

it("retains non-action and null-projection identities and propagates the original callback error", () => {
  const entry = action();
  const marker: AppendRecordingEntryInput = { type: "marker", label: "passive" };
  const callback = vi.fn(() => null);
  const prepared = prepareRecordingEntryTargets([marker, entry], "device", { receiver: undefined, callback });
  expect(prepared[0]).toBe(marker);
  expect(prepared[1]).toBe(entry);
  expect(callback).toHaveBeenCalledTimes(1);
  const original = new Error("controlled projection refusal");
  const refuse = () => {
    throw original;
  };
  expect(() => prepareRecordingEntryTargets([entry], "device", { receiver: undefined, callback: refuse })).toThrow(original);
});

it("refuses a projection accessor without invoking it", () => {
  let getters = 0;
  const projected = {
    get parameters() {
      getters++;
      return {};
    }
  };
  expect(() => prepareRecordingEntryTargets([action()], "device", { receiver: undefined, callback: () => projected })).toThrow("invalid_parameters");
  expect(getters).toBe(0);
});

it("rejects a callback mutation of the original entry before accepting its projection", () => {
  const entry = action();
  const callback = () => {
    Reflect.set(entry, "outputId", "other.set");
    return { parameters: {} };
  };
  expect(() => prepareRecordingEntryTargets([entry], "device", { receiver: undefined, callback })).toThrow("entry_changed");
});
