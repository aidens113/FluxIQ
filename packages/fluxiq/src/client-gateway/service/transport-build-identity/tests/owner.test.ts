import { expect, it } from "vitest";
import { ClientGatewayService } from "../../../index.ts";
const identity = { schema: 1 as const, protocol: "fluxiq.module-build-identity.v1" as const, moduleId: "fluxiq/web-client-gateway-server", version: "0.1.0", normalization: "module-payload-v1" as const, artifactDigest: "a".repeat(64), sourceInputsDigest: "b".repeat(64) };
it("actual gateway captures immutable anchor before IO but attests only a listening lease", () => {
  const gateway = new ClientGatewayService(); const input = { ...identity };
  const lease = gateway.bindTransportBuildIdentity(input); input.artifactDigest = "c".repeat(64);
  expect(gateway.readTransportBuildIdentity()).toBeNull(); lease.activate();
  expect(gateway.readTransportBuildIdentity()).toEqual(identity); expect(Object.isFrozen(gateway.readTransportBuildIdentity())).toBe(true);
  lease.release(); expect(gateway.readTransportBuildIdentity()).toBeNull();
});
it("changed retained identity refuses and legacy clearing cannot reset anchor", () => {
  const gateway = new ClientGatewayService(), lease = gateway.bindTransportBuildIdentity(identity); lease.activate();
  expect(() => gateway.bindTransportBuildIdentity({ ...identity, artifactDigest: "c".repeat(64) })).toThrow(/changed/);
  expect(gateway.readTransportBuildIdentity()).toEqual(identity);
  gateway.bindTransportBuildIdentity().activate(); expect(gateway.readTransportBuildIdentity()).toBeNull();
  expect(() => gateway.bindTransportBuildIdentity({ ...identity, sourceInputsDigest: "c".repeat(64) })).toThrow(/changed/);
});
it("superseded lease cannot activate or release another same-build active lease", () => {
  const gateway = new ClientGatewayService(), old = gateway.bindTransportBuildIdentity(identity), next = gateway.bindTransportBuildIdentity(identity);
  old.activate(); expect(gateway.readTransportBuildIdentity()).toBeNull(); next.activate(); old.release();
  expect(gateway.readTransportBuildIdentity()).toEqual(identity); next.release(); next.activate();
  expect(gateway.readTransportBuildIdentity()).toBeNull();
});
it("malformed capture preserves existing active descriptor; unrelated owners stay separate", () => {
  const first = new ClientGatewayService(), second = new ClientGatewayService(); first.bindTransportBuildIdentity(identity).activate();
  expect(() => first.bindTransportBuildIdentity({ ...identity, artifactDigest: "bad" })).toThrow(/Malformed/);
  expect(first.readTransportBuildIdentity()).toEqual(identity); expect(second.readTransportBuildIdentity()).toBeNull();
});
