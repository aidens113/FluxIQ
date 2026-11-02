import type { ClientGatewayService } from "../service.ts";
import type { IoRegistry } from "../../io/index.ts";
import type { RecordingSink } from "../../runtime/recording/sink/index.ts";
import type { RecordingStartPolicy, RecordingIngressPolicy } from "./policies/index.ts";
import type { RecordingWriteFailure } from "./writes/index.ts";
export interface ClientGatewayRecordingBridgeOptions<TTarget, TEvidence> { gateway: ClientGatewayService; sink: RecordingSink<TTarget, TEvidence>; startPolicy: RecordingStartPolicy; ingress: RecordingIngressPolicy<TTarget, TEvidence>; io?: IoRegistry; stopDrainMs?: number; onWriteFailure?: (failure: RecordingWriteFailure) => void | Promise<void> }
