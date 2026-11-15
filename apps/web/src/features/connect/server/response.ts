export const CONNECT_RESPONSE_HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY" };

export function connectJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CONNECT_RESPONSE_HEADERS });
}

export function connectRedirect(location: string): Response {
  return new Response(null, { status: 303, headers: { ...CONNECT_RESPONSE_HEADERS, location } });
}
