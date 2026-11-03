import type { ModelExecutionOptions } from "../../execution/index.ts";
import type { ModelTransportObservation } from "../../transport/index.ts";

/** Each entry receives its own current child; a public step carries no execution authority. */
export interface NativeModelLogExchange {
  readonly legacy: ModelTransportObservation | undefined;
  reply(...args: [...Parameters<ModelTransportObservation["reply"]>, ModelExecutionOptions]): Promise<void>;
  succeeded(...args: [...Parameters<ModelTransportObservation["succeeded"]>, ModelExecutionOptions]): Promise<void>;
  failed(...args: [...Parameters<ModelTransportObservation["failed"]>, ModelExecutionOptions]): Promise<void>;
}
