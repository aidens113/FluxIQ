import path from "node:path";
import { DEFAULT_SESSION_TTL_MS, TotpRequiredError } from "fluxiq";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { DurableLoginAttemptTracker, loginClientAddress } from "../../../../lib/login-attempts";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
// Failed logins from one trusted client address, whichever usernames they name.
// Applied only when a trusted proxy forwards the address: without one there is
// no per-client address, and a shared placeholder would let any client lock out
// every other.
const ADDRESS_MAX_ATTEMPTS = 20;
// Failed logins across the whole panel, whatever the address or username.
const PANEL_MAX_ATTEMPTS = 100;
const PANEL_KEY = "panel";
// loginClientAddress's placeholder for a proxied request that forwards no address.
const UNKNOWN_PROXIED_ADDRESS = "proxy-unknown";

const trackers = new Map<string, DurableLoginAttemptTracker>();

function attemptTracker(fileName: string, maxAttempts: number): DurableLoginAttemptTracker {
  let tracker = trackers.get(fileName);
  if (!tracker) {
    tracker = new DurableLoginAttemptTracker(path.join(getFluxIQ().paths.fluxiq, "security", fileName), {
      windowMs: ATTEMPT_WINDOW_MS,
      lockoutMs: LOCKOUT_MS,
      maxAttempts,
      maxEntries: 10_000,
    });
    trackers.set(fileName, tracker);
  }
  return tracker;
}

function usernameAttempts(): DurableLoginAttemptTracker {
  return attemptTracker("login-attempts.json", MAX_ATTEMPTS);
}

function addressAttempts(): DurableLoginAttemptTracker {
  return attemptTracker("login-address-attempts.json", ADDRESS_MAX_ATTEMPTS);
}

function panelAttempts(): DurableLoginAttemptTracker {
  return attemptTracker("login-panel-attempts.json", PANEL_MAX_ATTEMPTS);
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => undefined)) as
    | {
        username?: string;
        password?: string;
        totp?: string;
      }
    | undefined;

  if (!payload?.username || !payload.password) {
    return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
  }
  const totpError = loginTotpError(payload.totp);
  if (totpError) {
    return NextResponse.json({ ok: false, code: "invalid_totp", fieldErrors: { totp: totpError }, error: totpError }, { status: 400 });
  }

  const attemptKey = rateLimitKey(request, payload.username);
  const addressKey = trustedClientAddress(request);
  const locked = Math.max(
    await panelAttempts().remainingLockout(PANEL_KEY),
    addressKey ? await addressAttempts().remainingLockout(addressKey) : 0,
    await usernameAttempts().remainingLockout(attemptKey),
  );
  if (locked > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Too many failed attempts. Try again in ${Math.ceil(locked / 1000)} seconds.`,
        retryAfterMs: locked,
      },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(locked / 1000)) },
      },
    );
  }

  try {
    const fluxiq = getFluxIQ();
    const result = await fluxiq.programs.identityAccess.authenticate({
      username: payload.username,
      password: payload.password,
      ...(payload.totp ? { totp: payload.totp } : {}),
      ttlMs: DEFAULT_SESSION_TTL_MS,
    });
    try {
      await fluxiq.programs.secretKeys.unlockSession({
        sessionId: result.session.id,
        userId: result.user.id,
        authorizationPassword: payload.password,
        expiresAtMs: result.session.expiresAtMs,
      });
    } catch (error) {
      await fluxiq.programs.identityAccess.revokeSession(result.session.id);
      throw error;
    }
    // Only the username's count clears: a successful login must not reset the
    // address or panel bound, or one valid account would reopen a spray between rounds.
    await usernameAttempts().clear(attemptKey);
    const response = NextResponse.json({
      ok: true,
      payload: {
        user: result.user,
        role: result.role,
        expiresAtMs: result.session.expiresAtMs,
        requiresCredentialSetup: result.user.username === "admin" && payload.password === "admin",
      },
    });
    response.cookies.set(FLUXIQ_SESSION_COOKIE, result.session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    const failed = await usernameAttempts().registerFailure(attemptKey);
    // An authenticator prompt answers a correct password rather than a guess, so
    // the staged login of an account with 2FA counts only against its username.
    const guess = !(error instanceof TotpRequiredError && !payload.totp);
    const addressFailed = guess && addressKey ? await addressAttempts().registerFailure(addressKey) : null;
    const panelFailed = guess ? await panelAttempts().registerFailure(PANEL_KEY) : null;
    const lockedUntilMs = Math.max(failed.lockedUntilMs, addressFailed?.lockedUntilMs ?? 0, panelFailed?.lockedUntilMs ?? 0);
    const status = lockedUntilMs > Date.now() ? 429 : 401;
    const retryAfterMs = Math.max(0, lockedUntilMs - Date.now());
    const attemptsRemaining = Math.max(
      0,
      Math.min(
        MAX_ATTEMPTS - failed.count,
        addressFailed ? ADDRESS_MAX_ATTEMPTS - addressFailed.count : MAX_ATTEMPTS,
        panelFailed ? PANEL_MAX_ATTEMPTS - panelFailed.count : MAX_ATTEMPTS,
      ),
    );
    if (error instanceof TotpRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          requiresTotp: true,
          error: error.message,
          attemptsRemaining,
          retryAfterMs,
        },
        { status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        attemptsRemaining,
        retryAfterMs,
      },
      { status },
    );
  }
}

/** The client address a trusted proxy forwarded, or null when no per-client address exists to bound. */
function trustedClientAddress(request: Request): string | null {
  if (process.env.FLUXIQ_TRUST_PROXY !== "true") return null;
  const address = loginClientAddress(request, true);
  return address === UNKNOWN_PROXIED_ADDRESS ? null : address;
}

export function rateLimitKey(request: Request, username: string): string {
  const address = loginClientAddress(request, process.env.FLUXIQ_TRUST_PROXY === "true");
  return `${address}:${username.trim().toLowerCase()}`;
}

export function loginTotpError(totp: string | undefined): string | null {
  return totp && !/^\d{6}$/.test(totp) ? "Authenticator code must contain exactly 6 digits." : null;
}
