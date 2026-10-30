import { describe, expect, it } from "vitest";
import { isCrossSiteRequest } from "../is-cross-site-request";

const ORIGIN = "https://app.getfluxiq.com";
const check = (headers: Record<string, string>, over: Partial<Parameters<typeof isCrossSiteRequest>[0]> = {}) =>
  isCrossSiteRequest({ method: "POST", headers: new Headers(headers), hasSessionCookie: true, allowedOrigin: ORIGIN, ...over });

describe("isCrossSiteRequest", () => {
  it("allows same-origin and direct navigations", () => {
    expect(check({ "sec-fetch-site": "same-origin", origin: ORIGIN })).toBe(false);
    expect(check({ "sec-fetch-site": "none" })).toBe(false);
  });
  it("refuses cross-site, same-site and foreign-Origin cookie writes", () => {
    expect(check({ "sec-fetch-site": "cross-site" })).toBe(true);
    expect(check({ "sec-fetch-site": "same-site", origin: "https://getfluxiq.com" })).toBe(true);
    expect(check({ origin: "https://getfluxiq.com" })).toBe(true);
    expect(check({ origin: "https://evil.example" }, { method: "DELETE" })).toBe(true);
  });
  it("exempts Bearer, cookie-less, safe methods and header-less clients", () => {
    expect(check({ "sec-fetch-site": "cross-site", authorization: "Bearer abc" })).toBe(false);
    expect(check({ "sec-fetch-site": "cross-site" }, { hasSessionCookie: false })).toBe(false);
    expect(check({ "sec-fetch-site": "cross-site" }, { method: "GET" })).toBe(false);
    expect(check({})).toBe(false);
  });
  it("on local, accepts an Origin equal to its own Host", () => {
    const local = { allowedOrigin: null };
    expect(check({ origin: "http://localhost:3000", host: "localhost:3000" }, local)).toBe(false);
    expect(check({ origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, local)).toBe(false);
    expect(check({ origin: "http://127.0.0.1:3000", host: "localhost:3000" }, local)).toBe(true);
    expect(check({ origin: "https://evil.example", host: "localhost:3000" }, local)).toBe(true);
  });
});
