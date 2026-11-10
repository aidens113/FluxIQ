import { agoText } from "./relative-time";
import type { HomeClient, HomeTone } from "./types";

export type ConnectedRow = { key: string; name: string; kind: string; state: string; tone: HomeTone; lastSeen: string };

function kindOf(transport: string): string {
  if (transport === "websocket") return "Browser or program";
  if (transport === "worker") return "Host";
  if (transport === "native") return "Native host";
  if (transport === "direct") return "Built in";
  return "Client";
}

function stateOf(status: string): { state: string; tone: HomeTone } {
  if (status === "ready" || status === "available") return { state: "Connected", tone: "ok" };
  if (status === "busy") return { state: "Busy", tone: "neutral" };
  if (status === "pairing_required") return { state: "Waiting to be paired", tone: "warn" };
  if (status === "offline") return { state: "Not connected", tone: "bad" };
  return { state: "Not known", tone: "neutral" };
}

/** Each client or host with what it is, whether it is connected, and when it was last seen. Connected ones first. */
export function connectedRows(clients: readonly HomeClient[], now: number): ConnectedRow[] {
  return clients
    .map((client) => ({ client, ...stateOf(client.status) }))
    .sort((a, b) => Number(b.tone === "ok") - Number(a.tone === "ok") || (b.client.lastSeenAt ?? 0) - (a.client.lastSeenAt ?? 0))
    .map(({ client, state, tone }) => ({
      key: client.clientId,
      name: client.label,
      kind: kindOf(client.transport),
      state,
      tone,
      lastSeen: agoText(client.lastSeenAt, now)
    }));
}
