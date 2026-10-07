import { ClientGatewayCommandContext } from "./context.ts";
import { ClientGatewayCommandOutcome } from "./outcome.ts";

/** Registration validation and STOP only; the real resolver still enforces live ownership/storage. */
export class ClientGatewayRequiredCommandContext {
  static assertRequired(context: ClientGatewayCommandContext): void {
    ClientGatewayCommandContext.owner(context);
    if (!ClientGatewayCommandOutcome.observer(context)) throw new Error("command_outcome.required_observer_missing");
  }
  static async stop(context: ClientGatewayCommandContext, reason: string): Promise<void> {
    this.assertRequired(context); await ClientGatewayCommandOutcome.stop(context, reason);
  }
}
