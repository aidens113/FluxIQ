import type { ObservedGatewayBinding } from "./gateway/index.ts";
import type { OutputGatewayTarget } from "./gateway-target.ts";

export interface OutputExecutionAdmissionOptions {
  readonly gateway?: ObservedGatewayBinding;
  readonly gatewayTargets?: readonly OutputGatewayTarget[];
}
