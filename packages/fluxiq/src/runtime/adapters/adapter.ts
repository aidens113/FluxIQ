import type { JsonValue } from "../../core/index.ts";
import type { RuntimeAdapterActionRequest } from "./action-request.ts";
import type { RuntimeObservation } from "./observation.ts";
export type RuntimeAdapter<TState = unknown, TStateSchema = unknown, TActionDefinition = unknown, TActionResult = unknown> = {
  adapterId: string;
  label: string;
  kind: string;
  capabilities(): Promise<Record<string, JsonValue>> | Record<string, JsonValue>;
  stateSchemas?(): Promise<TStateSchema[]> | TStateSchema[];
  actionDefinitions?(): Promise<TActionDefinition[]> | TActionDefinition[];
  captureObservation?(): Promise<RuntimeObservation<TState>> | RuntimeObservation<TState>;
  executeAction?(request: RuntimeAdapterActionRequest): Promise<TActionResult> | TActionResult;
};
