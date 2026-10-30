import { normalizeIpAddress } from "../normalize-ip-address.ts";

/**
 * The address a connection counts as. With a trusted proxy, the rightmost
 * non-empty `X-Forwarded-For` entry (the one the trusted proxy appended) wins;
 * a value that is not an IP shape is ignored and the peer is used instead.
 */
export function resolveClientAddress(input: {
  peerAddress: string | null | undefined;
  forwardedFor: string | null | undefined;
  trustProxy: boolean;
}): { address: string | null; source: "peer" | "forwarded" | "none" } {
  if (input.trustProxy && input.forwardedFor) {
    const entries = input.forwardedFor.split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");
    const forwarded = normalizeIpAddress(entries[entries.length - 1]);
    if (forwarded) return { address: forwarded, source: "forwarded" };
  }
  const peer = normalizeIpAddress(input.peerAddress);
  return peer ? { address: peer, source: "peer" } : { address: null, source: "none" };
}
