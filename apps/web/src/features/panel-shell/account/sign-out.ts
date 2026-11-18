/** Where signing out lands: the panel's own address, which shows the sign-in page once the session is gone. */
const SIGNED_OUT_PATH = "/";

/**
 * Ends this browser's session (`POST /api/auth/logout`) and sends the person to the
 * sign-in page. Answers false, and stays where it is, when the server did not
 * end the session, so the caller can say so instead of leaving a page of 401s.
 */
export async function signOut(go: (path: string) => void = (path) => window.location.assign(path)): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    if (!response.ok) return false;
  } catch {
    return false;
  }
  go(SIGNED_OUT_PATH);
  return true;
}
