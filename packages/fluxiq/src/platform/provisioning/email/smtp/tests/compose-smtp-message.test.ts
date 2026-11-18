import { describe, expect, it } from "vitest";
import { composeSmtpMessage } from "../compose-smtp-message.ts";

const email = { template: "welcome", to: "a@example.test", subject: "Hello", text: "line one\n.line two\r\nline three" } as const;
const headers = { from: "FluxIQ <accounts@fluxiq.example>", messageId: "<id@fluxiq.example>", date: new Date(Date.UTC(2026, 10, 17, 12, 0, 0)) };

describe("composeSmtpMessage", () => {
  it("writes CRLF headers, a blank line and a base64 body of 76-character lines", () => {
    const data = composeSmtpMessage({ ...email, text: "x".repeat(200) }, headers);
    const [head = "", body = ""] = data.split("\r\n\r\n");
    expect(head.split("\r\n")).toEqual([
      "From: FluxIQ <accounts@fluxiq.example>", "To: a@example.test", "Subject: Hello", "Date: Tue, 17 Nov 2026 12:00:00 GMT",
      "Message-ID: <id@fluxiq.example>", "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64"
    ]);
    const lines = body.split("\r\n").filter(Boolean);
    expect(lines.every((line) => line.length <= 76)).toBe(true);
    expect(Buffer.from(lines.join(""), "base64").toString("utf8")).toBe("x".repeat(200));
    expect(data.endsWith("\r\n")).toBe(true);
  });

  it("normalises line endings in the text and encodes non-ASCII headers", () => {
    const data = composeSmtpMessage({ ...email, subject: "Bienvenue à FluxIQ" }, { ...headers, from: "Équipe <accounts@fluxiq.example>" });
    expect(data).toContain(`Subject: =?UTF-8?B?${Buffer.from("Bienvenue à FluxIQ").toString("base64")}?=\r\n`);
    expect(data).toContain(`From: =?UTF-8?B?${Buffer.from("Équipe").toString("base64")}?= <accounts@fluxiq.example>\r\n`);
    const [, body = ""] = data.split("\r\n\r\n");
    expect(Buffer.from(body.replace(/\r\n/gu, ""), "base64").toString("utf8")).toBe("line one\r\n.line two\r\nline three");
  });

  it("refuses a header value with a line break", () => {
    expect(() => composeSmtpMessage({ ...email, subject: "Hi\r\nBcc: x@y.example" }, headers)).toThrow("one line");
  });
});
