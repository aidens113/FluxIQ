import type { RenderedPlatformEmail } from "../types.ts";

/** What one message's DATA needs besides the rendered email. */
export type SmtpMessageHeaders = {
  from: string;
  messageId: string;
  date: Date;
};

/**
 * The message as sent after DATA: RFC 5322 headers, then the text as UTF-8 in
 * base64 lines of 76 characters, every line ending in CRLF and the whole
 * dot-stuffed, without the terminating `.` line. Non-ASCII header words are
 * RFC 2047 encoded.
 */
export function composeSmtpMessage(email: RenderedPlatformEmail, headers: SmtpMessageHeaders): string {
  for (const value of [email.to, email.subject, headers.from, headers.messageId]) {
    if (/[\r\n]/u.test(value)) throw new Error("An email header must be one line.");
  }
  const text = email.text.replace(/\r\n|\r|\n/gu, "\r\n");
  const body = Buffer.from(text, "utf8").toString("base64").replace(/.{1,76}/gu, (line) => `${line}\r\n`);
  const lines = [
    `From: ${encodeDisplayName(headers.from)}`,
    `To: ${email.to}`,
    `Subject: ${encodeWord(email.subject)}`,
    `Date: ${headers.date.toUTCString()}`,
    `Message-ID: ${headers.messageId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    ""
  ];
  const message = `${lines.join("\r\n")}\r\n${body}`;
  return message.replace(/(^|\r\n)\./gu, "$1..");
}

function encodeWord(value: string): string {
  return /^[\x20-\x7e]*$/u.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeDisplayName(value: string): string {
  const match = /^(.*?)\s*(<[^<>]*>)\s*$/u.exec(value.trim());
  if (!match) return value.trim();
  const name = (match[1] ?? "").replace(/^"(.*)"$/u, "$1");
  if (name === "") return match[2] ?? "";
  return `${encodeWord(name)} ${match[2] ?? ""}`;
}
