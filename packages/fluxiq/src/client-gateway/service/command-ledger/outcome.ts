import { ClientGatewayCommandContext } from "./context.ts";
import type { ClientGatewayCommandOutcomeObserver } from "./contracts.ts";

/** Required mode is private context registration, never a serialized option. */
export class ClientGatewayCommandOutcome {
  private static readonly observers = new WeakMap<ClientGatewayCommandContext, ClientGatewayCommandOutcomeObserver>();
  static require(context: ClientGatewayCommandContext, observer: ClientGatewayCommandOutcomeObserver): void {
    ClientGatewayCommandContext.owner(context);
    if (!observer || typeof observer.completed !== "function" || typeof observer.uncertain !== "function" || this.observers.has(context)) throw new Error("command_outcome.invalid_registration");
    this.observers.set(context, Object.freeze(observer));
  }
  static observer(context: ClientGatewayCommandContext): ClientGatewayCommandOutcomeObserver | undefined {
    ClientGatewayCommandContext.owner(context); return this.observers.get(context);
  }
}
