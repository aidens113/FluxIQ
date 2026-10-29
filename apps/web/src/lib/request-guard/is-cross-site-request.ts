const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type CrossSiteInput = {
  method: string;
  headers: Headers;
  hasSessionCookie: boolean;
  /** The one origin a browser request may come from; `null` allows an Origin whose host equals the request's own Host (local installs). */
  allowedOrigin: string | null;
};

/**
 * True for a state-changing request that carries the session cookie, no
 * Bearer credential, and browser evidence it was started from another site.
 * With neither `Sec-Fetch-Site` nor `Origin` the caller is not a browser and
 * is allowed (the extension sends Bearer and no cookies).
 */
export function isCrossSiteRequest({ method, headers, hasSessionCookie, allowedOrigin }: CrossSiteInput): boolean {
  if (!STATE_CHANGING.has(method.toUpperCase()) || !hasSessionCookie) return false;
  if (/^bearer\s/iu.test(headers.get("authorization") ?? "")) return false;
  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (origin === null) return false;
  if (allowedOrigin !== null) return origin !== allowedOrigin;
  try {
    return new URL(origin).host !== headers.get("host");
  } catch {
    return true;
  }
}
