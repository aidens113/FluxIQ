import { afterEach, describe, expect, it, vi } from "vitest";
import { isCrossSiteRequest } from "../isCrossSiteRequest";

function post(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: "POST", headers });
}

describe("isCrossSiteRequest (welcome and setup posts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the page's own post when Next reports the URL as localhost but the browser addressed 127.0.0.1", () => {
    expect(isCrossSiteRequest(post("http://localhost:3000/welcome/describe", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }))).toBe(false);
  });

  it("refuses an Origin whose host is not the addressed Host", () => {
    expect(isCrossSiteRequest(post("http://127.0.0.1:3000/welcome/submit", { origin: "http://evil.example", host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("refuses a post the browser marks as cross-site or same-site from another origin", () => {
    expect(isCrossSiteRequest(post("http://127.0.0.1:3000/welcome/submit", { "sec-fetch-site": "cross-site", host: "127.0.0.1:3000" }))).toBe(true);
    expect(isCrossSiteRequest(post("http://127.0.0.1:3000/welcome/submit", { "sec-fetch-site": "same-site", host: "127.0.0.1:3000" }))).toBe(true);
  });

  it("refuses a malformed Origin, and allows a caller that sends no browser evidence", () => {
    expect(isCrossSiteRequest(post("http://127.0.0.1:3000/welcome/submit", { origin: "not a url", host: "127.0.0.1:3000" }))).toBe(true);
    expect(isCrossSiteRequest(post("http://127.0.0.1:3000/welcome/submit", { host: "127.0.0.1:3000" }))).toBe(false);
  });
});
