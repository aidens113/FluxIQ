/** Keep an initial sign-in on its requested local route, never a URL authority. */
export function localAuthDestination(candidate: unknown, origin: string): string {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(candidate) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(candidate)) return "/";
  try {
    const base = new URL(origin);
    if (base.protocol !== "http:" && base.protocol !== "https:") return "/";
    const target = new URL(candidate, base.origin);
    if (target.origin !== base.origin || target.username || target.password) return "/";
    // Decode pathname layers only. Query values are data, including domain IDs
    // with encoded separators; they never select the redirect authority.
    for (const pathname of [candidate.split(/[?#]/, 1)[0]!, target.pathname]) {
      let decoded = decodeURIComponent(pathname);
      for (;;) {
        if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decoded)) return "/";
        const next = decoded.replace(/(?:%[0-9a-f]{2})+/gi, (sequence) => decodeURIComponent(sequence));
        if (next === decoded) break;
        decoded = next;
      }
    }
    return candidate;
  } catch { return "/"; }
}
