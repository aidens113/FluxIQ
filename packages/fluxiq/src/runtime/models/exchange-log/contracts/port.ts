import type { ModelExecutionOptions } from "../../execution/index.ts";
import type { ModelTransportCall, ModelTransportObserver } from "../../transport/index.ts";
import type { NativeModelLogExchange } from "./exchange.ts";

/** Internal native selection, separate from every provider request and public observation. */
export interface NativeModelLogPort {
  readonly observer: ModelTransportObserver;
  observeTask(call: ModelTransportCall, execution: ModelExecutionOptions): Promise<NativeModelLogExchange>;
}
