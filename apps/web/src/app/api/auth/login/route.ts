import { DEFAULT_SESSION_TTL_MS, TotpRequiredError } from "fluxiq";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { LoginAttemptTracker } from "../../../../lib/login-attempts";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new LoginAttemptTracker({ windowMs: ATTEMPT_WINDOW_MS, lockoutMs: LOCKOUT_MS, maxAttempts: MAX_ATTEMPTS });

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

  const attemptKey = rateLimitKey(request, payload.username);
  const locked = attempts.remainingLockout(attemptKey);
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
    attempts.clear(attemptKey);
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
    const failed = attempts.registerFailure(attemptKey);
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

function rateLimitKey(request: Request, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip") || "local";
  return `${address}:${username.trim().toLowerCase()}`;
}
