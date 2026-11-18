import { describe, expect, it } from "vitest";
import { envelopeAddress } from "../envelope-address.ts";

describe("envelopeAddress", () => {
  it("takes the bare address from a display form or a plain address", () => {
    expect(envelopeAddress("FluxIQ <accounts@fluxiq.example>")).toBe("accounts@fluxiq.example");
    expect(envelopeAddress(" a@b.example ")).toBe("a@b.example");
  });

  it("refuses anything that is not one plain address", () => {
    expect(() => envelopeAddress("a@b.example\r\nRCPT TO:<c@d.example>")).toThrow("one line");
    expect(() => envelopeAddress("no address")).toThrow("plain address");
    expect(() => envelopeAddress("<a@b.example> trailing")).toThrow("plain address");
    expect(() => envelopeAddress("Name <a b@c.example>")).toThrow("plain address");
  });
});
