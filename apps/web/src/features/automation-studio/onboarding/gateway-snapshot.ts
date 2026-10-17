import type { ClientGatewayPort, ClientGatewayResult } from "../clients/client-api-types";
import type { ClientGatewaySnapshot } from "../clients/client-model";

/** The gateway caps a summary page at 200 items; the checklist needs every live session. */
const LIST_LIMIT = 200;

type ListResult = Awaited<ReturnType<ClientGatewayPort["listItems"]>>;

/**
 * The snapshot endpoint returns counts only, with `sessions` and `pairings`
 * left empty; the lists come from the paged items endpoint. This composes the
 * three so the pairing step sees the real sessions and pairings. A failed
 * read of any of them fails the whole reading with its own error, so a list
 * that could not be read is never mistaken for an empty one.
 */
export async function loadOnboardingGatewaySnapshot(port: Pick<ClientGatewayPort, "querySnapshot" | "listItems">): Promise<ClientGatewayResult<ClientGatewaySnapshot>> {
  const [snapshot, sessions, pairings] = await Promise.all([
    port.querySnapshot(),
    port.listItems({ kind: "sessions", limit: LIST_LIMIT }),
    port.listItems({ kind: "pairings", limit: LIST_LIMIT })
  ]);
  if (!snapshot.ok) {
    return snapshot;
  }
  const sessionItems = listItems(sessions);
  if (!sessionItems.ok) {
    return { ok: false, error: sessionItems.error ?? "Connected browsers could not be read." };
  }
  const pairingItems = listItems(pairings);
  if (!pairingItems.ok) {
    return { ok: false, error: pairingItems.error ?? "Pairing requests could not be read." };
  }
  if (snapshot.payload === null || typeof snapshot.payload !== "object") {
    return snapshot;
  }
  return { ok: true, payload: { ...snapshot.payload, sessions: sessionItems.items, pairings: pairingItems.items } };
}

function listItems(result: ListResult): { ok: true; items: any[] } | { ok: false; error?: string | undefined } {
  if (!result.ok) {
    return { ok: false, error: result.error?.trim() ? result.error : undefined };
  }
  const items = result.payload?.items ?? [];
  if (!Array.isArray(items)) {
    return { ok: false };
  }
  return { ok: true, items };
}
