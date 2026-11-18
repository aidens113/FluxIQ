/**
 * True for the sign-up page while sign-up is not open (`FLUXIQ_SIGNUP`, open
 * only on `service`). The middleware answers it 404 before rendering starts:
 * a page that calls `notFound()` under the root loading boundary has already
 * streamed a 200 shell, so only a decision taken here gives a real 404. The
 * submit route answers its own JSON 404, so only the page path matches.
 */
export function isClosedSignupPath(pathname: string, signup: "off" | "open"): boolean {
  if (signup === "open") return false;
  return (pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname) === "/signup";
}
