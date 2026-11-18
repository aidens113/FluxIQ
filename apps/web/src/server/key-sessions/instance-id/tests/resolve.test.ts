import { describe, expect, it } from "vitest";
import { keySessionConfig } from "../../config";
import { buildDiscoveryDocument } from "../../../../app/api/discovery";
import { resolveInstanceId } from "../resolve";

const local = { profile: "local", publicOrigin: "http://localhost:3000" };

describe("resolveInstanceId", () => {
  it("prefers the explicit identity", () => {
    expect(resolveInstanceId({ FLUXIQ_INSTANCE_ID: " mine " }, local)).toBe("mine");
  });
  it("derives the same local identity on every call, as after a restart", () => {
    expect(resolveInstanceId({}, local)).toBe(resolveInstanceId({}, { ...local }));
    expect(resolveInstanceId({}, local)).toMatch(/^local-[0-9a-f]{16}$/u);
  });
  it("differs per origin", () => {
    expect(resolveInstanceId({}, local)).not.toBe(resolveInstanceId({}, { ...local, publicOrigin: "http://localhost:3001" }));
  });
  it("never invents one for service or self-hosted", () => {
    expect(resolveInstanceId({}, { profile: "service", publicOrigin: "https://a.example" })).toBeUndefined();
    expect(resolveInstanceId({}, { profile: "self-hosted", publicOrigin: "https://a.example" })).toBeUndefined();
  });
  it("agrees between discovery and key sessions", () => {
    const env = { FLUXIQ_PROFILE: "local", FLUXIQ_PUBLIC_ORIGIN: "http://localhost:3000" };
    const built = buildDiscoveryDocument(env);
    if (!built.ok) throw new Error("discovery refused");
    expect((built.document as { instance: { id?: string } }).instance.id).toBe(keySessionConfig(env).instanceId);
  });
});
