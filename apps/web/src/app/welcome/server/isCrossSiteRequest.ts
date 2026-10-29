/** True when the browser says the request came from another site: an `Origin` that is not this request's own, or `sec-fetch-site: cross-site`. */
export function isCrossSiteRequest(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}
