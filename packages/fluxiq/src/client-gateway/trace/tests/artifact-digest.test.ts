import { describe, expect, it } from "vitest";
import { clientGatewayTraceArtifactDigest } from "../index.ts";

describe("clientGatewayTraceArtifactDigest", () => {
  it("is the lower-case hex SHA-256 of the bytes", () => {
    expect(clientGatewayTraceArtifactDigest(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
