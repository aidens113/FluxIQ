const BEARER = /^Bearer +(\S+) *$/iu;

/** The token of an `Authorization: Bearer <token>` header; null when the header is absent or has another form. */
export function readBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = BEARER.exec(header);
  return match?.[1] ?? null;
}
