import { describe, expect, it } from "vitest";
import { parseSmtpEndpoint } from "../parse-smtp-endpoint.ts";

describe("parseSmtpEndpoint", () => {
  it("reads each scheme with its default port", () => {
    expect(parseSmtpEndpoint("smtp://mailpit:1025")).toEqual({ security: "plain", host: "mailpit", port: 1025 });
    expect(parseSmtpEndpoint("smtp://relay.example")).toEqual({ security: "plain", host: "relay.example", port: 25 });
    expect(parseSmtpEndpoint("smtp+starttls://smtp.example.org")).toEqual({ security: "starttls", host: "smtp.example.org", port: 587 });
    expect(parseSmtpEndpoint(" smtps://smtp.example.org:2465 ")).toEqual({ security: "tls", host: "smtp.example.org", port: 2465 });
    expect(parseSmtpEndpoint("smtp://[::1]:25")).toEqual({ security: "plain", host: "::1", port: 25 });
  });

  it("refuses credentials, paths, other schemes and nonsense", () => {
    expect(() => parseSmtpEndpoint("smtp://user:secret@relay.example:587")).toThrow("credentials");
    expect(() => parseSmtpEndpoint("smtp://relay.example:25/path")).toThrow("only a host and a port");
    expect(() => parseSmtpEndpoint("smtp://relay.example:25?x=1")).toThrow("only a host and a port");
    expect(() => parseSmtpEndpoint("http://relay.example")).toThrow("must start with");
    expect(() => parseSmtpEndpoint("mailpit:1025")).toThrow("must start with");
    expect(() => parseSmtpEndpoint("not a url")).toThrow("must look like");
  });
});
