import type { IdentityAccessService } from "fluxiq";
import { localSetupCode } from "./setup-code";
import type { LocalFirstRun } from "./types";

/** The account identity access seeds with the temporary password, on an install made before local first runs started unclaimed. */
const TEMPORARY_ADMIN_ID = "admin";

/**
 * Run once at start on `local` (`lib/fluxiq.ts`).
 *
 * - The default admin still on its temporary password: every one of its
 *   sessions is revoked (sessions made before that password stopped opening
 *   one), and a setup link is printed.
 * - No account yet: a setup link is printed.
 * - An owner exists: nothing.
 *
 * The link carries the code after `#`, so a browser never sends it to the
 * server in a URL: the setup page reads it and posts it in a body. It is the
 * only line that holds the code, written to the terminal that started the panel.
 */
export async function prepareLocalFirstRun(input: {
  identity: Pick<IdentityAccessService, "firstRun" | "revokeUserSessions">;
  origin: string;
  log: (line: string) => void;
  nowMs?: number;
}): Promise<LocalFirstRun> {
  const state = await input.identity.firstRun.state();
  if (state === "claimed") return { state, link: null, revokedSessions: 0 };
  const revokedSessions = state === "temporary-admin" ? await input.identity.revokeUserSessions(TEMPORARY_ADMIN_ID) : 0;
  const { code } = localSetupCode.issue(input.nowMs);
  const link = `${input.origin}/setup#${code}`;
  const hours = Math.round(localSetupCode.ttlMs / 3_600_000);
  if (revokedSessions > 0) input.log(`[FluxIQ] Ended ${revokedSessions} session(s) of the default admin account, which still has its temporary password.`);
  input.log(`[FluxIQ] First-time setup: open ${link} to choose your name and password. The link works once, for ${hours} hours; restart FluxIQ for a new one.`);
  return { state, link, revokedSessions };
}
