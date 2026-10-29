import { describe, expect, it } from "vitest";
import { parseListenAddress } from "../parse-listen-address";

describe("parseListenAddress", () => {
  it("reads an IPv4, bracketed IPv6 or localhost host and a port", () => {
    expect(parseListenAddress("0.0.0.0:4780")).toEqual({ host: "0.0.0.0", port: 4780 });
    expect(parseListenAddress(" [::1]:4780 ")).toEqual({ host: "::1", port: 4780 });
    expect(parseListenAddress("localhost:1")).toEqual({ host: "localhost", port: 1 });
  });

  it("refuses anything else", () => {
    for (const value of ["", "4780", ":4780", "127.0.0.1:", "127.0.0.1:0", "127.0.0.1:65536", "::1:4780", "[::1]", "fluxiq:4780", "127.0.0.1:4780:1"]) {
      expect(() => parseListenAddress(value), value).toThrow(/FLUXIQ_PROVISIONING_LISTEN/u);
    }
  });
});
