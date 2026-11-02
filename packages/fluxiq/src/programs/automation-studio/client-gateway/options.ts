import type { ClientGatewayService } from "../../../client-gateway/index.ts";
import type { IoRegistry } from "../../../io/index.ts";
import type { AutomationStudioService } from "../runtime/service.ts";
import type { ClientRecordingContextProvider } from "./context.ts";
export type AutomationStudioClientGatewayBridgeOptions = { gateway: ClientGatewayService; automationStudio: AutomationStudioService; io?: IoRegistry; clientRecordingContextProvider?: ClientRecordingContextProvider; stopDrainMs?: number };
