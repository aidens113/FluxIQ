import type { JsonObject, JsonValue } from "../../core/index.ts";
export type RuntimeObservation<TState = unknown> = {
  observationType: string;
  state?: TState;
  signals?: Record<string, JsonValue>;
  payload?: JsonObject;
  metadata?: JsonObject;
};
