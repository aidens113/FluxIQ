import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveClientGatewayConfig } from "../config.ts";
import { ClientGatewayPairingRegistry } from "../pairings.ts";
import { ClientGatewayPairingCapacityError } from "../security/index.ts";

// t802 W2b: pairing codes come from the cryptographic generator, and the number
// of challenges waiting for approval is capped in total and per address.
describe("ClientGatewayPairingRegistry codes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints six-digit codes without Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig());
    const codes = Array.from({ length: 300 }, () => registry.create({}).pairingCode);

    expect(random).not.toHaveBeenCalled();
    for (const code of codes) {
      expect(code).toMatch(/^[1-9]\d{5}$/);
      expect(Number(code)).toBeGreaterThanOrEqual(100000);
      expect(Number(code)).toBeLessThanOrEqual(999999);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("ClientGatewayPairingRegistry pending caps", () => {
  it("refuses a new challenge once `total` are waiting, and admits one again after approval or expiry", () => {
    let now = 1_000;
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig({ now: () => now, pairingTtlMs: 1_000, pairingLimits: { total: 2 } }));
    const first = registry.create({ requestedBySessionId: "s1" });
    registry.create({ requestedBySessionId: "s2" });

    const refusal = registry.capacityRefusal("s3");
    expect(refusal).toBeInstanceOf(ClientGatewayPairingCapacityError);
    expect(refusal).toMatchObject({ code: "pairing.capacity_reached", scope: "total" });

    // A consumed challenge is no longer waiting.
    first.consumedAt = now;
    expect(registry.capacityRefusal("s3")).toBeUndefined();
    registry.create({ requestedBySessionId: "s3" });
    expect(registry.capacityRefusal("s4")?.scope).toBe("total");

    // Expired challenges are no longer waiting.
    now += 1_001;
    expect(registry.capacityRefusal("s4")).toBeUndefined();
  });

  it("caps challenges per address only when the cap is on, and never for an unknown address", () => {
    const addresses: Record<string, string | null> = { a1: "203.0.113.5", a2: "203.0.113.5", b1: "198.51.100.7", n1: null, n2: null };
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig(), (sessionId) => addresses[sessionId] ?? null);
    registry.create({ requestedBySessionId: "a1" });
    expect(registry.capacityRefusal("a2")).toBeUndefined();

    registry.setLimits({ perAddress: 1, total: 1000 });
    expect(registry.capacityRefusal("a2")?.scope).toBe("per_address");
    expect(registry.capacityRefusal("b1")).toBeUndefined();
    registry.create({ requestedBySessionId: "n1" });
    expect(registry.capacityRefusal("n2")).toBeUndefined();
    // An operator-created challenge has no requesting session, so only `total` applies.
    expect(registry.capacityRefusal(undefined)).toBeUndefined();
  });

  it("defaults to 1,000 in total with the per-address cap off", () => {
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig(), () => "127.0.0.1");
    expect(registry.getLimits()).toEqual({ perAddress: null, total: 1000 });
    for (let index = 0; index < 999; index += 1) registry.create({ requestedBySessionId: `local-${index}` });
    expect(registry.capacityRefusal("local-999")).toBeUndefined();
    registry.create({ requestedBySessionId: "local-999" });
    expect(registry.capacityRefusal("local-1000")?.scope).toBe("total");
  });

  it("refuses invalid limits", () => {
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig());
    expect(() => registry.setLimits({ perAddress: 0, total: 10 })).toThrow(/pairing_limits_invalid/);
    expect(() => registry.setLimits({ perAddress: null, total: 0 })).toThrow(/pairing_limits_invalid/);
    expect(() => registry.setLimits({ perAddress: 1.5, total: 10 })).toThrow(/pairing_limits_invalid/);
    expect(() => resolveClientGatewayConfig({ pairingLimits: { total: -1 } })).toThrow(/pairing_limits_invalid/);
    expect(registry.getLimits()).toEqual({ perAddress: null, total: 1000 });
  });
});

// t916: the registry tells of the changes no other collaborator records as
// they happen -- a challenge created, and challenges lapsing -- and lapses a
// challenge at its expiry, not when something next reads it.
describe("ClientGatewayPairingRegistry changes", () => {
  function manualTimers() {
    const waits: Array<{ delayMs: number; fire: () => void; cancelled: boolean }> = [];
    return {
      waits,
      start: (delayMs: number, fire: () => void) => {
        // A wait that ran out is over, as a cancelled one is.
        const wait = {
          delayMs,
          cancelled: false,
          fire: () => {
            wait.cancelled = true;
            fire();
          }
        };
        waits.push(wait);
        return { cancel: () => { wait.cancelled = true; } };
      },
      live: () => waits.filter((wait) => !wait.cancelled)
    };
  }

  it("says a challenge was requested once per challenge created", () => {
    const changed: string[] = [];
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig(), () => null, { changed: (kind) => changed.push(kind), startExpiryTimer: manualTimers().start });
    registry.create({ requestedBySessionId: "s1" });
    registry.create({ requestedBySessionId: "s2" });
    expect(changed).toEqual(["pairing.requested", "pairing.requested"]);
  });

  it("lapses the earliest waiting challenge just after its expiry, says so once, and waits for the next", () => {
    let now = 10_000;
    const timers = manualTimers();
    const changed: string[] = [];
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig({ now: () => now, pairingTtlMs: 1_000 }), () => null, { changed: (kind) => changed.push(kind), startExpiryTimer: timers.start });
    registry.create({ requestedBySessionId: "s1" });
    now = 10_500;
    const second = registry.create({ requestedBySessionId: "s2" });
    // One wait, for the earlier challenge, just past its expiry.
    expect(timers.live().map((wait) => wait.delayMs)).toEqual([1_001]);

    now = 11_001;
    timers.live()[0]!.fire();
    expect(changed).toEqual(["pairing.requested", "pairing.requested", "pairing.expired"]);
    expect(registry.list().map((pairing) => pairing.pairingCode)).toEqual([second.pairingCode]);
    expect(timers.live().map((wait) => wait.delayMs)).toEqual([500]);

    now = 11_501;
    timers.live()[0]!.fire();
    expect(changed.filter((kind) => kind === "pairing.expired")).toHaveLength(2);
    expect(registry.size()).toBe(0);
    expect(timers.live()).toEqual([]);
  });

  it("moves the wait to an earlier challenge, and says nothing when a read finds nothing lapsed", () => {
    let now = 0;
    const timers = manualTimers();
    const changed: string[] = [];
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig({ now: () => now }), () => null, { changed: (kind) => changed.push(kind), startExpiryTimer: timers.start });
    registry.create({ requestedBySessionId: "s1", ttlMs: 5_000 });
    registry.create({ requestedBySessionId: "s2", ttlMs: 1_000 });
    expect(timers.live().map((wait) => wait.delayMs)).toEqual([1_001]);
    registry.pruneExpired();
    expect(changed).toEqual(["pairing.requested", "pairing.requested"]);
    now = 2_000;
    registry.pruneExpired();
    expect(changed.at(-1)).toBe("pairing.expired");
  });

  it("does not start the wait again on a clock that has not moved since it began", () => {
    const timers = manualTimers();
    const registry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig({ now: () => 5_000, pairingTtlMs: 0 }), () => null, { startExpiryTimer: timers.start });
    registry.create({ requestedBySessionId: "s1" });
    timers.live()[0]!.fire();
    expect(registry.size()).toBe(1);
    expect(timers.live()).toEqual([]);
  });

  it("pruneExpired reports which sessions' requests expired, after the lapse is signalled and they are gone", () => {
    let now = 0;
    const heard: string[] = [];
    const registry: ClientGatewayPairingRegistry = new ClientGatewayPairingRegistry(resolveClientGatewayConfig({ now: () => now }), () => null, {
      changed: (kind) => heard.push(kind),
      lapsed: (challenges) => {
        heard.push(`lapsed ${challenges.map((challenge) => challenge.requestedBySessionId).join(",")}`);
        expect(challenges.every((challenge) => registry.get(challenge.pairingCode) === undefined)).toBe(true);
      },
      startExpiryTimer: manualTimers().start
    });
    registry.create({ requestedBySessionId: "s1", ttlMs: 1_000 });
    registry.create({ requestedBySessionId: "s2", ttlMs: 1_000 });
    const consumed = registry.create({ requestedBySessionId: "s3", ttlMs: 1_000 });
    consumed.consumedAt = 500;
    registry.create({ requestedBySessionId: "s4", ttlMs: 5_000 });
    heard.length = 0;

    now = 1_001;
    registry.pruneExpired();
    registry.pruneExpired();

    expect(heard).toEqual(["pairing.expired", "lapsed s1,s2"]);
  });
});
