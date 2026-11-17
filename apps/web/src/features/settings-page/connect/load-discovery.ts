/** The discovery document as read: its body, or that it could not be read. */
export type DiscoveryRead = { ok: true; value: unknown } | { ok: false };

/** Reads `/.well-known/fluxiq` once. A failure is an answer, not an error: the connect view leaves the discovery fields blank and says so. */
export async function loadDiscovery(signal: AbortSignal): Promise<DiscoveryRead> {
  try {
    const response = await fetch("/.well-known/fluxiq", { cache: "no-store", signal });
    if (!response.ok) return { ok: false };
    return { ok: true, value: await response.json() };
  } catch {
    // An unreachable or unparsable discovery document reads as one that could not be read; the view says so.
    return { ok: false };
  }
}
