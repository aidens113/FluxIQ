import type { PlatformEmailTemplateOverrides } from "../types.ts";

/**
 * How the sender reaches the server:
 *
 * - `plain`: `smtp://host:port`, no encryption and no authentication. Only for
 *   a relay or a mail sink on a private network (a local Mailpit).
 * - `starttls`: `smtp+starttls://host:port`, upgraded with STARTTLS before
 *   anything else is sent; a server that does not offer it is refused.
 * - `tls`: `smtps://host:port`, TLS from the first byte.
 */
export type SmtpSecurity = "plain" | "starttls" | "tls";

/** One parsed `smtp://`, `smtp+starttls://` or `smtps://` address. */
export type SmtpEndpoint = {
  security: SmtpSecurity;
  host: string;
  port: number;
};

/** Credentials for SMTP AUTH (PLAIN or LOGIN). Only ever sent over TLS. */
export type SmtpCredentials = {
  username: string;
  secret: string;
};

/** Operator-supplied delivery configuration; never part of a public request. */
export type SmtpEmailOptions = {
  endpoint: SmtpEndpoint;
  /** The From header, `Name <address>` or a bare address. */
  from: string;
  auth?: SmtpCredentials;
  /** Extra certificate authorities to trust (PEM), for a private relay. */
  trustedCertificates?: string;
  /** The name given in EHLO; defaults to the From address's domain. */
  clientName?: string;
  templates?: PlatformEmailTemplateOverrides;
};

/** One server reply: its three-digit code and its text lines. */
export type SmtpReply = {
  code: number;
  lines: string[];
};
