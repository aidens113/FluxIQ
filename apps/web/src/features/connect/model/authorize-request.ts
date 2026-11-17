import { connectAuthorizeRequestSchema, connectRedirectUri, type ConnectAuthorizeRequest } from "fluxiq/platform/profile";

export const CONNECT_AUTHORIZE_FIELDS = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "client_install_id", "client_label"] as const;

/** Required fields occur exactly once. OAuth's unknown query parameters remain ignored. */
export function connectRequestFromParams(params: URLSearchParams, origin: string): ConnectAuthorizeRequest | null {
  if (CONNECT_AUTHORIZE_FIELDS.some((field) => params.getAll(field).length !== 1)) return null;
  const parsed = connectAuthorizeRequestSchema.safeParse(Object.fromEntries(CONNECT_AUTHORIZE_FIELDS.map((field) => [field, params.get(field)])));
  return parsed.success && parsed.data.redirect_uri === connectRedirectUri(origin) ? parsed.data : null;
}

export function connectRequestParams(request: ConnectAuthorizeRequest): URLSearchParams {
  return new URLSearchParams(CONNECT_AUTHORIZE_FIELDS.map((field) => [field, request[field]]));
}

export function connectPageParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) params.append(key, item);
  }
  return params;
}
