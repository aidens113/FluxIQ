import { DEFAULT_SESSION_TTL_MS, TotpRequiredError } from "fluxiq";
import { NextResponse } from "next/server";
import path from "node:path";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { DurableLoginAttemptTracker, loginClientAddress } from "../../../../lib/login-attempts";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

let attempts: DurableLoginAttemptTracker | null = null;

function loginAttempts(): DurableLoginAttemptTracker {
  return attempts ??= new DurableLoginAttemptTracker(
    path.join(getFluxIQ().paths.fluxiq, "security", "login-attempts.json"),
    { windowMs: ATTEMPT_WINDOW_MS, lockoutMs: LOCKOUT_MS, maxAttempts: MAX_ATTEMPTS, maxEntries: 10_000 }
  );
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
  const locked = await loginAttempts().remainingLockout(attemptKey);
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
    const result = await getFluxIQ().programs.identityAccess.authenticate({
      username: payload.username,
      password: payload.password,
      ...(payload.totp ? { totp: payload.totp } : {}),
      ttlMs: DEFAULT_SESSION_TTL_MS,
    });
    await loginAttempts().clear(attemptKey);
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
    const failed = await loginAttempts().registerFailure(attemptKey);
    const status = failed.lockedUntilMs > Date.now() ? 429 : 401;
    const retryAfterMs = Math.max(0, failed.lockedUntilMs - Date.now());
    if (error instanceof TotpRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          requiresTotp: true,
          error: error.message,
          attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failed.count),
          retryAfterMs,
        },
        { status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failed.count),
        retryAfterMs,
      },
      { status },
    );
  }
}

export function rateLimitKey(request: Request, username: string): string {
  const address = loginClientAddress(request, process.env.FLUXIQ_TRUST_PROXY === "true");
  return `${address}:${username.trim().toLowerCase()}`;
}

export function loginTotpError(totp: string | undefined): string | null {
  return totp && !/^\d{6}$/.test(totp) ? "Authenticator code must contain exactly 6 digits." : null;
}
