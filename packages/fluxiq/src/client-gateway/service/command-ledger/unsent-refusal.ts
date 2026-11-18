import type { ClientGatewayCommandClaim } from "./contracts.ts";
import { clientGatewayCanonicalDigest } from "./canonical-digest.ts";

type Code = "host_lease.stale" | "host_lease.holder_mismatch" | "host_lease.missing" | "cancelled_before_send" | "session_unavailable" | "socket_unavailable" | "target_changed" | "channel_scope_changed" | "settlement_unsupported" | "preparation_failed" | "timeout_before_send";
const codes: ReadonlySet<string> = new Set<Code>(["host_lease.stale", "host_lease.holder_mismatch", "host_lease.missing", "cancelled_before_send", "session_unavailable", "socket_unavailable", "target_changed", "channel_scope_changed", "settlement_unsupported", "preparation_failed", "timeout_before_send"]);
const proofs = new WeakMap<object, { digest: string; refusal: { code: Code; refusedAt: number }; settlementFailed: boolean }>();
const digest = (claim: ClientGatewayCommandClaim) => clientGatewayCanonicalDigest(claim, { maxBytes: 256 * 1024, maxDepth: 64, maxNodes: 65_536 });

/** Live server pretransport proof. Error text, prototypes, and persisted pending claims cannot recreate it. */
export class ClientGatewayCommandUnsentRefusal extends Error {
  private constructor() { super("durable_command.refused_unsent"); }

  static create(claim: ClientGatewayCommandClaim, code: Code, refusedAt = Date.now()): ClientGatewayCommandUnsentRefusal {
    if (!codes.has(code) || !Number.isSafeInteger(refusedAt) || refusedAt < 0) throw new Error("command_ledger.invalid_unsent_refusal");
    const proof = new ClientGatewayCommandUnsentRefusal();
    proofs.set(proof, { digest: digest(claim), refusal: Object.freeze({ code, refusedAt }), settlementFailed: false });
    return proof;
  }

  static is(value: unknown): value is ClientGatewayCommandUnsentRefusal {
    return typeof value === "object" && value !== null && proofs.has(value);
  }

  static read(value: ClientGatewayCommandUnsentRefusal, claim: ClientGatewayCommandClaim): Readonly<{ code: Code; refusedAt: number }> {
    const proof = proofs.get(value);
    if (!proof || proof.digest !== digest(claim)) throw new Error("command_ledger.foreign_unsent_proof");
    return proof.refusal;
  }

  static validCode(value: unknown): value is Code { return typeof value === "string" && codes.has(value); }

  static isSettlementFailure(proof: ClientGatewayCommandUnsentRefusal): boolean { return proofs.get(proof)?.settlementFailed === true; }

  static settlementFailed(proof: ClientGatewayCommandUnsentRefusal): ClientGatewayCommandUnsentRefusal {
    const value = proofs.get(proof);
    if (!value) throw new Error("command_ledger.foreign_unsent_proof");
    value.settlementFailed = true;
    proof.message = "durable_command.unsent_settlement_failed";
    return proof;
  }
}
