import type { ModelTransportCall, ModelTransportObservation } from "../../transport/index.ts";

/** The unchanged synchronous observer, including its original explicit environment override. */
export type NativeModelLogLegacyObserver = (call: ModelTransportCall, env?: Readonly<Record<string, string | undefined>>) => ModelTransportObservation | undefined;
