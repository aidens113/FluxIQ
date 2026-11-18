import type { ClientGatewayHostLeaseRefusalCode } from "./refusal.ts";

type Code = ClientGatewayHostLeaseRefusalCode | "session_unavailable" | "preparation_failed" | "timeout_before_send";
const refusals = new WeakMap<object, Code>();

/** Internal proof that ordinary command preparation ended before queue/socket effects. */
export class ClientGatewayHostLeaseAdmissionRefusal extends Error {
  constructor(code: Code) { super("client_gateway.refused_unsent");
    refusals.set(this, code); }
  static code(value: unknown): Code | undefined { return typeof value === "object" && value !== null ? refusals.get(value) : undefined; }
}
