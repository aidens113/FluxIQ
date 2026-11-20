/** Where signing out lands when the page's own address cannot be read: the panel's root, which shows the sign-in page once the session is gone. */
const SIGNED_OUT_PATH = "/";

/**
 * The page the person is on, as a local path. Signing out stays on it: the
 * signed-out panel shows the sign-in page at the same address, and signing in
 * again returns to that page instead of Home.
 */
export function signedOutPath(location?: { pathname?: string; search?: string; hash?: string }): string {
  const path = `${location?.pathname ?? ""}${location?.search ?? ""}${location?.hash ?? ""}`;
  return path.startsWith("/") && !path.startsWith("//") ? path : SIGNED_OUT_PATH;
}

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
  go(signedOutPath(typeof window === "undefined" ? undefined : window.location));
  return true;
}
