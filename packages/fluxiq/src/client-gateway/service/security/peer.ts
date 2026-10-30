import type { JsonObject, JsonValue } from "../../../core/index.ts";

/**
 * Where a connection came from, as the transport read it. `address` is the
 * full client address; `prefix` is the part of it the audit may keep (the
 * transport decides how much to keep); `source` says whether it came from the
 * socket's own peer, from a forwarded header the transport was told to trust,
 * or from nowhere.
 *
 * The gateway keeps it on its own session record only. It never reaches the
 * public session (`ClientGatewaySession` is a frozen contract), an event, a
 * trace or the snapshot, and the audit carries `clientAddressPrefix` alone.
 */
export type ClientGatewayPeer = {
  address: string | null;
  prefix: string | null;
  source: "peer" | "forwarded" | "none";
};

const PEER_SOURCES: ReadonlySet<string> = new Set(["peer", "forwarded", "none"]);

// Metadata keys a transport might use for a full address; `recordTransportEvent` drops them.
const FULL_ADDRESS_KEYS: ReadonlySet<string> = new Set([
  "address",
  "clientAddress",
  "remoteAddress",
  "peerAddress",
  "forwardedFor",
  "xForwardedFor",
  "ip",
  "clientIp"
]);

/** A copy of what the transport passed, so a later change to its object never reaches the session. */
export function normalizeClientGatewayPeer(peer: ClientGatewayPeer): ClientGatewayPeer {
  return {
    address: typeof peer.address === "string" && peer.address ? peer.address : null,
    prefix: typeof peer.prefix === "string" && peer.prefix ? peer.prefix : null,
    source: PEER_SOURCES.has(peer.source) ? peer.source : "none"
  };
}

/** The audit fields for a peer: its prefix only, and nothing when no peer was given. */
export function clientGatewayPeerAuditFields(peer: ClientGatewayPeer | undefined): JsonObject {
  return peer ? { clientAddressPrefix: peer.prefix } : {};
}

/**
 * Transport-supplied audit metadata with every full address taken out. A
 * `peer` object is turned into its prefix; keys that name a full address are
 * dropped. Only the top level is read: nested values are the caller's to keep
 * address-free.
 */
export function withoutClientGatewayAddresses(metadata: JsonObject | undefined): JsonObject {
  const kept: JsonObject = {};
  if (!metadata) return kept;
  for (const [key, value] of Object.entries(metadata)) {
    if (FULL_ADDRESS_KEYS.has(key)) continue;
    if (key === "peer") {
      kept.clientAddressPrefix = prefixOf(value);
      continue;
    }
    kept[key] = value;
  }
  return kept;
}

function prefixOf(value: JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prefix = value.prefix;
  return typeof prefix === "string" && prefix ? prefix : null;
}
