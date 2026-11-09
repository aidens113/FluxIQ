import type { FluxIQ } from "../../framework/index.ts";

/**
 * A signed-in person spoke, and their cookie is what opens their stored unlock, so
 * it survives a Core restart with no password. Cheap once held. Never fails what
 * they asked for: a key that stays locked says so itself. Moved from the web
 * panel's `lib/auth.ts`, which re-exports it, because the program route calls it.
 */
export async function presentPanelSession(fluxiq: FluxIQ, sessionId: string, auth: { user: { id: string }; session: { expiresAtMs: number } }): Promise<void> {
  try {
    await fluxiq.programs.secretKeys.credentialUnlocks.presentPanelSession({ sessionId, userId: auth.user.id, expiresAtMs: auth.session.expiresAtMs });
  } catch (error) {
    // A key that stays locked says so itself; whatever they asked for goes on. The name only: a store's message could quote what it was reading.
    console.warn(`A stored unlock could not be opened (${error instanceof Error ? error.name : "non_error"}).`);
  }
}
