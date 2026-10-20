// The highest host lease a client has seen for each resource key, against
// which every leased command is judged (`./judgement.ts`).
//
// Kept in a storage area that outlives the client's worker (`../storage-area/`),
// one key per resource (`<keyPrefix><resourceKey>`), so a restarted client
// still knows which epoch is current: without it, a stale holder's late command
// reaching a fresh client would be adopted as a new grant. A memory of what
// this ledger judged sits in front of storage, so a storage fault never loses
// a lease already seen; the fault is handed back for the caller to report.
//
// Judgements run one after another. Two commands judged at once would each
// read the old epoch, and the lower one could then be written last.

import { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES, type ClientGatewayActionResult, type ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayStorageArea } from "../storage-area/index.ts";
import { clientGatewayHostLeaseJudgement } from "./judgement.ts";
import { clientGatewayHostLeaseReading } from "./reading.ts";
import { clientGatewayHostLeaseRefusalCode } from "./refusal-code.ts";
import { clientGatewayHostLeaseRefusal } from "./refusal.ts";
import type { ClientGatewayHostLeaseJudgement } from "./types.ts";

/** How a lease was judged, the lease it was judged against, and a storage fault met on the way. */
export type ClientGatewayHostLeaseAdmission = {
  readonly judgement: ClientGatewayHostLeaseJudgement;
  readonly seen: ClientGatewayHostLease | undefined;
  readonly fault?: unknown;
};

/** What a command's lease earns it: a refusal to send instead of running it, or nothing; and a storage fault to report. */
export type ClientGatewayHostLeaseVerdict = {
  readonly refusal?: ClientGatewayActionResult;
  readonly fault?: unknown;
};

export type ClientGatewayHostLeaseLedgerOptions = {
  /** The prefix each resource's key is stored under (default `fluxiq.hostLease.`). */
  readonly keyPrefix?: string;
};

export class ClientGatewayHostLeaseLedger {
  private readonly memory = new Map<string, ClientGatewayHostLease>();
  private readonly keyPrefix: string;
  private turn: Promise<unknown> = Promise.resolve();

  constructor(private readonly area: ClientGatewayStorageArea, options: ClientGatewayHostLeaseLedgerOptions = {}) {
    this.keyPrefix = options.keyPrefix ?? "fluxiq.hostLease.";
  }

  /** Judges `lease` against the highest seen for its resource, and keeps it when it is higher. */
  admit(lease: ClientGatewayHostLease): Promise<ClientGatewayHostLeaseAdmission> {
    const next = this.turn.then(async () => await this.judge(lease));
    // The next judgement waits for this one however it ends; its caller hears how.
    this.turn = next.then(() => undefined, () => undefined);
    return next;
  }

  /**
   * The verdict on a command's `lease` field as it came off the wire: no lease
   * runs as it always has; one that cannot be read is refused as missing; a
   * readable one is admitted, and refused when stale or another holder's.
   */
  async verdict(commandId: string, lease: unknown, now: () => number = Date.now): Promise<ClientGatewayHostLeaseVerdict> {
    const reading = clientGatewayHostLeaseReading(lease);
    if (reading.kind === "none") return {};
    if (reading.kind === "unreadable") return { refusal: clientGatewayHostLeaseRefusal(commandId, CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES.missing, now()) };
    const admission = await this.admit(reading.lease);
    const code = clientGatewayHostLeaseRefusalCode(admission.judgement);
    const refusal = code === undefined ? undefined : clientGatewayHostLeaseRefusal(commandId, code, now(), admission.seen?.epoch);
    return { ...(refusal === undefined ? {} : { refusal }), ...(admission.fault === undefined ? {} : { fault: admission.fault }) };
  }

  private async judge(lease: ClientGatewayHostLease): Promise<ClientGatewayHostLeaseAdmission> {
    const key = this.keyPrefix + lease.resourceKey;
    let fault: unknown;
    let seen = this.memory.get(key);
    if (seen === undefined) {
      try {
        seen = storedLease((await this.area.get(null))[key]);
      } catch (error) {
        fault = error;
      }
    }
    const judgement = clientGatewayHostLeaseJudgement(lease, seen);
    if (judgement === "adopt") {
      this.memory.set(key, lease);
      try {
        await this.area.set({ [key]: lease });
      } catch (error) {
        fault ??= error;
      }
    } else if (seen !== undefined) {
      this.memory.set(key, seen);
    }
    return fault === undefined ? { judgement, seen } : { judgement, seen, fault };
  }
}

/** A stored lease read field by field, as any wire lease is; a value that is not one counts as none. */
function storedLease(value: unknown): ClientGatewayHostLease | undefined {
  const reading = clientGatewayHostLeaseReading(value);
  return reading.kind === "lease" ? reading.lease : undefined;
}
