import type { ClientGatewayReportedActionResult } from "../action/index.ts";
import type { ClientGatewayReconcileState } from "./state.ts";

/** A client's answer to `server.reconcile_command`. `result` is present only on `landed`. */
export type ClientGatewayReconcileAnswer = {
  commandId: string;
  state: ClientGatewayReconcileState;
  result?: ClientGatewayReportedActionResult;
};
