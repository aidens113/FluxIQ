import { ClientGatewayRecordingBridge } from "../../../client-gateway/recording/index.ts";
import type { ActionTarget, EvidenceReference } from "../model/index.ts";
import { createAutomationStudioRecordingSink } from "../runtime/service/recording-sink/index.ts";
import { studioRecordingIngress } from "./ingress/index.ts";
import type { ClientRecordingContextProvider } from "./context.ts";
import type { AutomationStudioClientGatewayBridgeOptions } from "./options.ts";
import { StudioRecordingStartPolicy } from "./start-policy.ts";

export type { AutomationStudioClientGatewayBridgeOptions } from "./options.ts";
export type { ClientRecordingContext, ClientRecordingContextProvider } from "./context.ts";
export type { StartClientRecordingInput } from "../../../client-gateway/recording/index.ts";

/** Studio supplies persistence and legacy ingress policy to the shared capture owner. */
export class AutomationStudioClientGatewayBridge extends ClientGatewayRecordingBridge<ActionTarget, EvidenceReference> {
  private readonly recordingPolicy: StudioRecordingStartPolicy;

  constructor(options: AutomationStudioClientGatewayBridgeOptions) {
    const policy = new StudioRecordingStartPolicy(options.clientRecordingContextProvider);
    super({
      gateway: options.gateway,
      sink: createAutomationStudioRecordingSink(options.automationStudio),
      startPolicy: policy,
      ingress: studioRecordingIngress,
      ...(options.io !== undefined ? { io: options.io } : {}),
      ...(options.stopDrainMs !== undefined ? { stopDrainMs: options.stopDrainMs } : {})
    });
    this.recordingPolicy = policy;
    policy.bindReceiver(this);
  }

  setClientRecordingContextProvider(provider: ClientRecordingContextProvider | undefined): void {
    this.recordingPolicy.setProvider(provider);
  }
}
