import { asRecord } from "./as-record";
import { agoText } from "./relative-time";
import { textOf } from "./text-of";
import type { HomeClient, HomeTone } from "./types";

export type ConnectedRow = { key: string; name: string; kind: string; state: string; tone: HomeTone; lastSeen?: string; attempts: number };
export type ConnectedGroups = { connected: ConnectedRow[]; waiting: ConnectedRow[] };

/** Browsers and apps whose access was removed; their old connection rows are not shown. */
export type RevokedAccess = { clientIds: ReadonlySet<string>; names: ReadonlySet<string> };

export const NO_REVOKED: RevokedAccess = { clientIds: new Set(), names: new Set() };

/** Which browsers and apps had their access removed, from the client gateway's `trustedClients`. A name still held by an active one is not counted as removed. */
export function readRevokedAccess(trustedClients: unknown): RevokedAccess {
  if (!Array.isArray(trustedClients)) return NO_REVOKED;
  const active = new Set<string>();
  const removed: Array<{ clientId?: string; name?: string }> = [];
  for (const raw of trustedClients) {
    const row = asRecord(raw);
    if (!row) continue;
    const clientId = textOf(row.clientId);
    const name = textOf(row.name);
    if (textOf(row.status) === "revoked") removed.push({ ...(clientId ? { clientId } : {}), ...(name ? { name } : {}) });
    else if (name) active.add(name);
  }
  const clientIds = new Set<string>();
  const names = new Set<string>();
  for (const one of removed) {
    if (one.clientId) clientIds.add(one.clientId);
    if (one.name && !active.has(one.name)) names.add(one.name);
  }
  return { clientIds, names };
}

function kindOf(transport: string): string {
  if (transport === "websocket") return "Browser or program";
  if (transport === "worker") return "Host";
  if (transport === "native") return "Native host";
  return "Client";
}

function stateOf(status: string): { state: string; tone: HomeTone } {
  if (status === "ready" || status === "available") return { state: "Online", tone: "ok" };
  if (status === "busy") return { state: "Busy", tone: "neutral" };
  if (status === "pairing_required") return { state: "Waiting for approval", tone: "warn" };
  if (status === "offline") return { state: "Offline", tone: "neutral" };
  return { state: "Not known", tone: "neutral" };
}

function isRevoked(client: HomeClient, revoked: RevokedAccess): boolean {
  if (revoked.clientIds.has(client.clientId)) return true;
  // A removed browser cannot be live; its name is the only link when the gateway does not give the client id.
  return revoked.names.has(client.label) && client.status !== "ready" && client.status !== "busy";
}

function newest(a: HomeClient, b: HomeClient): HomeClient {
  return (b.lastSeenAt ?? 0) > (a.lastSeenAt ?? 0) ? b : a;
}

/**
 * What Home's browsers-and-apps card lists. Approved ones are "connected" (online first); ones asking to connect are
 * "waiting", repeat attempts folded into one row with a count; removed ones and the engine's own built-in runtime are
 * left out, since a person can do nothing with either.
 */
export function connectedGroups(clients: readonly HomeClient[], revoked: RevokedAccess, now: number): ConnectedGroups {
  const approved = new Map<string, HomeClient>();
  const asking = new Map<string, { client: HomeClient; attempts: number }>();
  for (const client of clients) {
    if (client.transport === "direct" || isRevoked(client, revoked)) continue;
    if (client.status === "pairing_required") {
      const key = `${client.label}|${client.transport}`;
      const seen = asking.get(key);
      asking.set(key, { client: seen ? newest(seen.client, client) : client, attempts: (seen?.attempts ?? 0) + 1 });
    } else {
      const seen = approved.get(client.clientId);
      approved.set(client.clientId, seen ? newest(seen, client) : client);
    }
  }
  const row = (client: HomeClient, attempts: number, key: string): ConnectedRow => ({
    key,
    name: client.label,
    kind: kindOf(client.transport),
    ...stateOf(client.status),
    ...(client.lastSeenAt === undefined ? {} : { lastSeen: agoText(client.lastSeenAt, now) }),
    attempts
  });
  const connected = [...approved.values()]
    .sort((a, b) => Number(stateOf(b.status).tone === "ok") - Number(stateOf(a.status).tone === "ok") || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0))
    .map((client) => row(client, 1, client.clientId));
  const waiting = [...asking.entries()]
    .sort(([, a], [, b]) => (b.client.lastSeenAt ?? 0) - (a.client.lastSeenAt ?? 0))
    .map(([key, { client, attempts }]) => row(client, attempts, key));
  return { connected, waiting };
}
