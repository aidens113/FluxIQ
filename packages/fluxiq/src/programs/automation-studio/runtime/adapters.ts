import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { ActionDefinition, ActionResult, StatePathSchema, StateSnapshot } from "../model/index.ts";

export type AutomationStudioObservation = {
  observationType: string;
  state?: StateSnapshot;
  signals?: Record<string, JsonValue>;
  payload?: JsonObject;
  metadata?: JsonObject;
};

export type AutomationStudioAdapterActionRequest = {
  actionType: string;
  parameters: JsonObject;
  target?: JsonObject;
  metadata?: JsonObject;
};

export type AutomationStudioRuntimeAdapter = {
  adapterId: string;
  label: string;
  kind: string;
  capabilities(): Promise<Record<string, JsonValue>> | Record<string, JsonValue>;
  stateSchemas?(): Promise<StatePathSchema[]> | StatePathSchema[];
  actionDefinitions?(): Promise<ActionDefinition[]> | ActionDefinition[];
  captureObservation?(): Promise<AutomationStudioObservation> | AutomationStudioObservation;
  executeAction?(request: AutomationStudioAdapterActionRequest): Promise<ActionResult> | ActionResult;
};

export class AutomationStudioAdapterRegistry {
  private readonly adapters = new Map<string, AutomationStudioRuntimeAdapter>();

  register(adapter: AutomationStudioRuntimeAdapter): void {
    this.adapters.set(adapter.adapterId, adapter);
  }

  get(adapterId: string): AutomationStudioRuntimeAdapter | undefined {
    return this.adapters.get(adapterId);
  }

  list(): AutomationStudioRuntimeAdapter[] {
    return [...this.adapters.values()];
  }
}
