const ADDRESS = /^[^\s<>@",;]+@[^\s<>@",;]+$/u;

/**
 * The bare address of a header value, `Name <a@b.example>` or `a@b.example`,
 * for MAIL FROM and RCPT TO. A value with a line break or no plain address is
 * refused, so nothing can inject a command or a header.
 */
export function envelopeAddress(value: string): string {
  if (/[\r\n]/u.test(value)) throw new Error("An email address must be one line.");
  const trimmed = value.trim();
  const bracketed = /<([^<>]*)>\s*$/u.exec(trimmed);
  const address = (bracketed ? bracketed[1] ?? "" : trimmed).trim();
  if (!ADDRESS.test(address)) throw new Error("An email address must be a plain address such as name@example.org.");
  return address;
}
