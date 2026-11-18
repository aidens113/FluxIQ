/**
 * The throttle key for a sign-up post: its email trimmed and lower-cased (as
 * provisioning normalises it), or null when the body has none (the handler
 * answers that with a 400). Reads a clone, so the handler still reads the body.
 */
export async function signupEmailKey(request: Request): Promise<string | null> {
  let body: { email?: unknown } | null;
  try {
    body = (await request.clone().json()) as { email?: unknown } | null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
}
