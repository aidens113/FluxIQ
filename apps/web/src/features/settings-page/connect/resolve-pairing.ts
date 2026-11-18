export type PairingOutcome = { ok: true } | { ok: false; problem: string };

async function refusalWords(response: Response, action: "approve" | "dismiss"): Promise<string> {
  const fallback = `The request could not be ${action === "approve" ? "approved" : "dismissed"}. Try again.`;
  try {
    const result = await response.json() as { error?: unknown };
    return typeof result.error === "string" ? result.error : fallback;
  } catch {
    return fallback;
  }
}

/** Approves or dismisses a waiting request through the panel routes. Returns the outcome, with a plain-words problem the page shows when it failed. Approving needs nothing more: a paired client can use models at once. */
export async function resolvePairing(action: "approve" | "dismiss", pairingCode: string): Promise<PairingOutcome> {
  try {
    const response = await fetch(`/api/client-gateway/${action}-pairing`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairingCode }) });
    if (response.ok) return { ok: true };
    return { ok: false, problem: await refusalWords(response, action) };
  } catch {
    return { ok: false, problem: "The panel could not be reached. The request is still waiting." };
  }
}
