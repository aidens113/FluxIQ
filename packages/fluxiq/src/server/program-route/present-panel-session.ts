import type { FluxIQ } from "../../framework/index.ts";

/**
 * Presents an already authenticated panel session for legacy credential recovery.
 * Host-protected model keys use current authority without an unlock ceremony.
 * Recovery failure does not fail the unrelated request. The caller must have
 * validated `auth` through its trusted identity authority. `fluxiq` is the
 * selected data workspace: presentation opens only its stored credential boxes,
 * never enrolls a new credential or reads another workspace's key store. Moved from the web
 * panel's `lib/auth.ts`, which re-exports it, because the program route calls it.
 */
export async function presentPanelSession(fluxiq: FluxIQ, sessionId: string, auth: { user: { id: string }; session: { expiresAtMs: number } }): Promise<void> {
  try {
    await fluxiq.programs.secretKeys.credentialUnlocks.presentPanelSession({ sessionId, userId: auth.user.id, expiresAtMs: auth.session.expiresAtMs });
  } catch (error) {
    // best-effort: legacy recovery does not gate authenticated requests. Log only the error class, never stored data.
    console.warn(`Legacy credential recovery was unavailable (${error instanceof Error ? error.name : "non_error"}).`);
  }
}
