import type { ClientGatewayReportedActionStatus } from "./reported-action-status.ts";
import type { ClientGatewayActionResult } from "./result.ts";

/** An action result as a client sends it: Core's result, whose status may also be `interrupted`. */
export type ClientGatewayReportedActionResult = Omit<ClientGatewayActionResult, "status"> & { status: ClientGatewayReportedActionStatus };
