import { describe, expect, it } from "vitest";
import { resolveFluxIQDeploymentSettings } from "../index.ts";

const HOSTED = { FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com" };

describe("resolveFluxIQDeploymentSettings defaults", () => {
  it("local equals today's behaviour", () => {
    expect(resolveFluxIQDeploymentSettings({})).toEqual({
      profile: "local",
      public: false,
      publicOrigin: "http://127.0.0.1:3000",
      gateway: {
        enabled: true,
        host: "127.0.0.1",
        port: 4777,
        path: "/client",
        loopbackBind: true,
        publicUrl: "ws://127.0.0.1:4777/client",
        allowedOrigins: undefined,
        limits: { maxFrameBytes: 268435456, helloDeadlineMs: null, messagesPerSecond: null, messageBurst: null, pendingPairingsPerAddress: null, pendingPairingsTotal: 1000 }
      },
      trustProxy: false,
      drainSeconds: 0,
      session: { name: "fluxiq_session", secure: false },
      setupCodeFile: null,
      logFormat: "text"
    });
  });

  it.each(["self-hosted", "service"])("%s uses the hosted defaults", (profile) => {
    const settings = resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: profile, ...HOSTED });
    expect(settings.gateway.limits).toEqual({ maxFrameBytes: 16777216, helloDeadlineMs: 10000, messagesPerSecond: 50, messageBurst: 200, pendingPairingsPerAddress: 5, pendingPairingsTotal: 1000 });
    expect(settings.drainSeconds).toBe(30);
    expect(settings.logFormat).toBe("json");
    expect(settings.gateway.publicUrl).toBe("wss://app.example.com/client");
    expect(settings.session).toEqual({ name: "__Host-fluxiq_session", secure: true });
  });

  it("local PORT feeds the default origin", () => {
    expect(resolveFluxIQDeploymentSettings({ PORT: "4000" }).publicOrigin).toBe("http://127.0.0.1:4000");
  });

  it("service is public even on loopback; self-hosted only beyond it", () => {
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED }).public).toBe(true);
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", ...HOSTED }).public).toBe(false);
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_CLIENT_GATEWAY_HOST: "0.0.0.0", ...HOSTED }).public).toBe(true);
  });
});

describe("resolveFluxIQDeploymentSettings overrides", () => {
  it("reads gateway host, port, path, origins and the public URL", () => {
    const settings = resolveFluxIQDeploymentSettings({
      FLUXIQ_CLIENT_GATEWAY_HOST: "0.0.0.0",
      FLUXIQ_CLIENT_GATEWAY_PORT: "5000",
      FLUXIQ_CLIENT_GATEWAY_PATH: "gw",
      FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS: " https://a.example , ,https://b.example ",
      FLUXIQ_CLIENT_GATEWAY_ENABLED: "false"
    });
    expect(settings.gateway).toMatchObject({ enabled: false, host: "0.0.0.0", port: 5000, path: "/gw", loopbackBind: false, publicUrl: "ws://127.0.0.1:5000/gw", allowedOrigins: ["https://a.example", "https://b.example"] });
    expect(settings.public).toBe(true);
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PUBLIC_CLIENT_WS_URL: "wss://x.example/c" }).gateway.publicUrl).toBe("wss://x.example/c");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_HOST: "::1" }).gateway.publicUrl).toBe("ws://[::1]:4777/client");
  });

  it("empty allowed origins are undefined", () => {
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS: " , " }).gateway.allowedOrigins).toBeUndefined();
  });

  it("uses ws only for a self-hosted http loopback origin, keeping the port", () => {
    const settings = resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "http://localhost:8080" });
    expect(settings.gateway.publicUrl).toBe("ws://localhost:8080/client");
    expect(settings.session).toEqual({ name: "fluxiq_session", secure: false });
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "http://example.com", NODE_ENV: "production" }).gateway.publicUrl).toBe("wss://example.com/client");
  });

  it("limits accept off/0 for nullable ones and numbers", () => {
    const settings = resolveFluxIQDeploymentSettings({
      FLUXIQ_PROFILE: "self-hosted",
      ...HOSTED,
      FLUXIQ_CLIENT_GATEWAY_HELLO_DEADLINE_MS: "off",
      FLUXIQ_CLIENT_GATEWAY_MESSAGES_PER_SECOND: "0",
      FLUXIQ_CLIENT_GATEWAY_MESSAGE_BURST: "7",
      FLUXIQ_CLIENT_GATEWAY_MAX_FRAME_BYTES: "1024",
      FLUXIQ_CLIENT_GATEWAY_PENDING_PAIRINGS_TOTAL: "9",
      FLUXIQ_CLIENT_GATEWAY_PENDING_PAIRINGS_PER_ADDRESS: "2",
      FLUXIQ_DRAIN_SECONDS: "5"
    });
    expect(settings.gateway.limits).toEqual({ maxFrameBytes: 1024, helloDeadlineMs: null, messagesPerSecond: null, messageBurst: 7, pendingPairingsPerAddress: 2, pendingPairingsTotal: 9 });
    expect(settings.drainSeconds).toBe(5);
  });

  it("reads proxy trust, setup code file and log format", () => {
    const settings = resolveFluxIQDeploymentSettings({ FLUXIQ_TRUST_PROXY: "true", FLUXIQ_SETUP_CODE_FILE: "/run/code", FLUXIQ_LOG_FORMAT: "json" });
    expect(settings).toMatchObject({ trustProxy: true, setupCodeFile: "/run/code", logFormat: "json" });
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_TRUST_PROXY: "yes" }).trustProxy).toBe(false);
  });

  it("session: http origin is secure only in production", () => {
    expect(resolveFluxIQDeploymentSettings({ NODE_ENV: "production" }).session).toEqual({ name: "fluxiq_session", secure: true });
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PUBLIC_ORIGIN: "https://x.example" }).session).toEqual({ name: "__Host-fluxiq_session", secure: true });
  });

  it("canonicalises the public origin", () => {
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://App.Example.com:443/path" }).publicOrigin).toBe("https://app.example.com");
  });
});

describe("resolveFluxIQDeploymentSettings refusals", () => {
  it("throws on an invalid profile", () => {
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "prod" })).toThrow(/FLUXIQ_PROFILE/u);
  });
  it.each(["self-hosted", "service"])("throws without a public origin on %s", (profile) => {
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: profile })).toThrow(/FLUXIQ_PUBLIC_ORIGIN is required/u);
  });
  it("throws on an http service origin and on a malformed or non-http origin", () => {
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "http://app.example.com" })).toThrow(/https/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PUBLIC_ORIGIN: "not a url" })).toThrow(/FLUXIQ_PUBLIC_ORIGIN/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PUBLIC_ORIGIN: "ftp://x.example" })).toThrow(/http/u);
  });
  it("throws on non-numeric limits, ports and drain, naming the variable only", () => {
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_MESSAGE_BURST: "lots" })).toThrow(/MESSAGE_BURST/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_MAX_FRAME_BYTES: "0" })).toThrow(/MAX_FRAME_BYTES/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_PORT: "99999" })).toThrow(/PORT/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_DRAIN_SECONDS: "-1" })).toThrow(/DRAIN/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_CLIENT_GATEWAY_PENDING_PAIRINGS_TOTAL: "secret-x" })).not.toThrow(/secret-x/u);
  });
});

describe("resolveFluxIQDeploymentSettings drain", () => {
  it("reads 0 or off as no drain on any profile", () => {
    const hosted = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.org" };
    expect(resolveFluxIQDeploymentSettings({ ...hosted, FLUXIQ_DRAIN_SECONDS: "0" }).drainSeconds).toBe(0);
    expect(resolveFluxIQDeploymentSettings({ ...hosted, FLUXIQ_DRAIN_SECONDS: "off" }).drainSeconds).toBe(0);
    expect(resolveFluxIQDeploymentSettings({ ...hosted, FLUXIQ_DRAIN_SECONDS: "12" }).drainSeconds).toBe(12);
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_DRAIN_SECONDS: "0" }).drainSeconds).toBe(0);
  });
});
