import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { DEFAULT_SESSION_TTL_MS, TotpRequiredError } from "fluxiq";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptState = {
  count: number;
  windowStartedAtMs: number;
  lockedUntilMs: number;
};

const attempts = new Map<string, AttemptState>();

export async function POST(request: Request) {
  const payload = await request.json().catch(() => undefined) as {
    username?: string;
    password?: string;
    totp?: string;
  } | undefined;

  if (!payload?.username || !payload.password) {
    return NextResponse.json({ ok: false, error: "Username and password are required" }, { status: 400 });
  }

  const attemptKey = rateLimitKey(request, payload.username);
  const locked = currentLockout(attemptKey);
  if (locked > 0) {
    return NextResponse.json({
      ok: false,
      error: `Too many failed attempts. Try again in ${Math.ceil(locked / 1000)} seconds.`,
      retryAfterMs: locked
    }, {
      status: 429,
      headers: { "retry-after": String(Math.ceil(locked / 1000)) }
    });
  }

  try {
    const result = await getFluxIQ().programs.identityAccess.authenticate({
      username: payload.username,
      password: payload.password,
      ...(payload.totp ? { totp: payload.totp } : {}),
      ttlMs: DEFAULT_SESSION_TTL_MS
    });
    attempts.delete(attemptKey);
    const response = NextResponse.json({
      ok: true,
      payload: {
        user: result.user,
        role: result.role,
        expiresAtMs: result.session.expiresAtMs
      }
    });
    response.cookies.set(FLUXIQ_SESSION_COOKIE, result.session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1000)
    });
    return response;
  } catch (error) {
    const failed = registerFailedAttempt(attemptKey);
    const status = failed.lockedUntilMs > Date.now() ? 429 : 401;
    const retryAfterMs = Math.max(0, failed.lockedUntilMs - Date.now());
    if (error instanceof TotpRequiredError) {
      return NextResponse.json({
        ok: false,
        requiresTotp: true,
        error: error.message,
        attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failed.count),
        retryAfterMs
      }, { status });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failed.count),
      retryAfterMs
    }, { status });
  }
}

function rateLimitKey(request: Request, username: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || request.headers.get("x-real-ip") || "local";
  return `${address}:${username.trim().toLowerCase()}`;
}

function currentLockout(key: string): number {
  const now = Date.now();
  const state = attempts.get(key);
  if (!state) return 0;
  if (state.lockedUntilMs > now) return state.lockedUntilMs - now;
  if (now - state.windowStartedAtMs > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }
  return 0;
}

function registerFailedAttempt(key: string): AttemptState {
  const now = Date.now();
  const existing = attempts.get(key);
  const state = !existing || now - existing.windowStartedAtMs > ATTEMPT_WINDOW_MS
    ? { count: 0, windowStartedAtMs: now, lockedUntilMs: 0 }
    : existing;
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntilMs = now + LOCKOUT_MS;
  }
  attempts.set(key, state);
  return state;
}
