import type { SmtpEndpoint, SmtpSecurity } from "./types.ts";

const SCHEMES: Readonly<Record<string, { security: SmtpSecurity; port: number }>> = {
  "smtp:": { security: "plain", port: 25 },
  "smtp+starttls:": { security: "starttls", port: 587 },
  "smtps:": { security: "tls", port: 465 }
};

/**
 * Parses `smtp://host:port`, `smtp+starttls://host:port` or `smtps://host:port`.
 * Credentials never travel in the address (they come from a secret file), and
 * a path, query or fragment is refused rather than ignored.
 */
export function parseSmtpEndpoint(value: string): SmtpEndpoint {
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { throw new Error("An SMTP address must look like smtp://host:port, smtp+starttls://host:port or smtps://host:port."); }
  const scheme = SCHEMES[url.protocol];
  if (scheme === undefined) throw new Error("An SMTP address must start with smtp://, smtp+starttls:// or smtps://.");
  if (url.username !== "" || url.password !== "") throw new Error("An SMTP address must not carry credentials; name a secret file instead.");
  if ((url.pathname !== "" && url.pathname !== "/") || url.search !== "" || url.hash !== "") throw new Error("An SMTP address takes only a host and a port.");
  const host = url.hostname.replace(/^\[(.*)\]$/u, "$1");
  if (host === "") throw new Error("An SMTP address needs a host.");
  const port = url.port === "" ? scheme.port : Number(url.port);
  return { security: scheme.security, host, port };
}
