import { describe, expect, expectTypeOf, it } from "vitest";
import { RuntimeAdapterRegistry, type RuntimeAdapter, type RuntimeObservation } from "../index.ts";
type DeviceState = {
  temperature: number;
};
type DeviceSchema = {
  metric: string;
};
type DeviceAction = {
  operation: string;
};
type DeviceResult = {
  accepted: boolean;
};
type DeviceAdapter = RuntimeAdapter<DeviceState, DeviceSchema, DeviceAction, DeviceResult>;
describe("runtime adapter registry", () => {
  it("retains supplied DTOs and original adapter identity", async () => {
    const observation: RuntimeObservation<DeviceState> = { observationType: "temperature", state: { temperature: 21 } };
    const adapter: DeviceAdapter = {
      adapterId: "thermostat", label: "Thermostat", kind: "device",
      capabilities: () => ({ adjust: true }),
      stateSchemas: () => [{ metric: "temperature" }],
      actionDefinitions: () => [{ operation: "set" }],
      captureObservation: () => observation,
      executeAction: () => ({ accepted: true })
    };
    const registry = new RuntimeAdapterRegistry<DeviceAdapter>();
    expect(registry.register(adapter)).toBeUndefined();
    expect(registry.get("thermostat")).toBe(adapter);
    expect(registry.list()).toEqual([adapter]);
    expect(await registry.get("thermostat")?.captureObservation?.()).toBe(observation);
    expectTypeOf(registry.get("thermostat")).toEqualTypeOf<DeviceAdapter | undefined>();
  });
  it("replaces by id without changing insertion order and returns defensive lists", () => {
    const adapter = (adapterId: string): RuntimeAdapter => ({ adapterId, label: adapterId, kind: "opaque", capabilities: () => ({}) });
    const first = adapter("first");
    const second = adapter("second");
    const replacement = adapter("first");
    const registry = new RuntimeAdapterRegistry();
    registry.register(first);
    registry.register(second);
    registry.register(replacement);
    const list = registry.list();
    expect(list).toEqual([replacement, second]);
    expect(list[0]).toBe(replacement);
    list.pop();
    expect(registry.list()).toEqual([replacement, second]);
    expect(registry.get("absent")).toBeUndefined();
  });
});
