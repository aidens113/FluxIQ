import type { ProcessIdentity } from "../process/index.ts";

/**
 * What a data root's owner file says: an opaque token, the process and machine that hold the
 * root, and which kind of server it is. It holds no data, key or request.
 */
export type FluxIQDataRootOwner = ProcessIdentity & {
  kind: "fluxiq.data-root-owner";
  version: 1;
  token: string;
  /** Which server holds the root, in words a person reads: "the web panel", "fluxiq dev". */
  role: string;
  /** When it took the root, ISO 8601. */
  claimedAt: string;
};

/** The owner a file holds, or why it holds none. */
export type FluxIQDataRootOwnerRead = { kind: "known"; owner: FluxIQDataRootOwner } | { kind: "missing" } | { kind: "unreadable" };

/** Parses an owner file's text; anything not exactly an owner record is unreadable, never guessed at. */
export function parseFluxIQDataRootOwner(text: string): FluxIQDataRootOwnerRead {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: "unreadable" };
  }
  if (!value || typeof value !== "object") return { kind: "unreadable" };
  const owner = value as Partial<FluxIQDataRootOwner>;
  const valid = owner.kind === "fluxiq.data-root-owner" && owner.version === 1
    && typeof owner.token === "string" && owner.token.length > 0
    && typeof owner.role === "string" && typeof owner.claimedAt === "string"
    && Number.isSafeInteger(owner.pid) && Number(owner.pid) > 0
    && (owner.startedAt === null || typeof owner.startedAt === "string")
    && typeof owner.platform === "string"
    && (owner.machine === null || typeof owner.machine === "string")
    && typeof owner.hostname === "string";
  return valid ? { kind: "known", owner: owner as FluxIQDataRootOwner } : { kind: "unreadable" };
}
