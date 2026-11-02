import { expect, expectTypeOf, it } from "vitest";
import { RuntimeAdapterRegistry, type RuntimeAdapter, type RuntimeAdapterActionRequest, type RuntimeObservation } from "../../../../../runtime/adapters/index.ts";
import { AutomationStudioAdapterRegistry, type AutomationStudioAdapterActionRequest, type AutomationStudioObservation, type AutomationStudioRuntimeAdapter } from "../../adapters.ts";
import type { ActionDefinition, ActionResult, StatePathSchema, StateSnapshot } from "../../../model/index.ts";
it("specializes the exact canonical constructor and DTOs without wrapping adapters", () => {
  expect(AutomationStudioAdapterRegistry).toBe(RuntimeAdapterRegistry);
  expect(AutomationStudioAdapterRegistry.name).toBe("AutomationStudioAdapterRegistry");
  const registry: AutomationStudioAdapterRegistry = new AutomationStudioAdapterRegistry();
  const adapter: AutomationStudioRuntimeAdapter = { adapterId: "studio", label: "Studio", kind: "host", capabilities: () => ({}) };
  registry.register(adapter);
  expect(registry).toBeInstanceOf(RuntimeAdapterRegistry);
  expect(registry.get("studio")).toBe(adapter);
  expectTypeOf(registry.get("studio")).toEqualTypeOf<AutomationStudioRuntimeAdapter | undefined>();
  expectTypeOf<AutomationStudioObservation>().toEqualTypeOf<RuntimeObservation<StateSnapshot>>();
  expectTypeOf<AutomationStudioAdapterActionRequest>().toEqualTypeOf<RuntimeAdapterActionRequest>();
  expectTypeOf<AutomationStudioRuntimeAdapter>().toEqualTypeOf<RuntimeAdapter<StateSnapshot, StatePathSchema, ActionDefinition, ActionResult>>();
});
