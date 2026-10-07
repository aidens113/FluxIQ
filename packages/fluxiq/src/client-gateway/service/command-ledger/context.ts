import { ClientGatewayCommandLedgerController } from "./controller.ts";
import type { ClientGatewayCommandBinding } from "./contracts.ts";

type Owner = Pick<ClientGatewayCommandBinding, "projectId" | "runId" | "flowId" | "invocationId" | "attemptId" | "effectOrdinal">;
const owners = new WeakMap<object, Owner>();
/** Opaque server capability. JSON, prototypes and copied fields cannot establish issuance. */
export class ClientGatewayCommandContext {
  private constructor() { Object.freeze(this); }
  /** Trusted local issuers additionally enforce their own stored-session registry when resolving. */
  static issue(input: Owner): ClientGatewayCommandContext {
    const keys = ["projectId", "runId", "flowId", "invocationId", "attemptId", "effectOrdinal"];
    ClientGatewayCommandLedgerController.digest(input);
    if (Object.keys(input).length !== keys.length || Object.keys(input).some(key => !keys.includes(key))) throw new Error("command_context.invalid_owner");
    ClientGatewayCommandLedgerController.commandId(input);
    const context = new ClientGatewayCommandContext(); owners.set(context, Object.freeze(structuredClone(input))); return context;
  }
  static owner(context: unknown): Owner {
    if (!context || typeof context !== "object" || !owners.has(context)) throw new Error("command_context.not_issued");
    return owners.get(context)!;
  }
}
