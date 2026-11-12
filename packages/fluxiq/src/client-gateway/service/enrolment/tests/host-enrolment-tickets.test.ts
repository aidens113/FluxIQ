// The one-time tickets that enrol a managed host: minted only in process, kept
// only as a digest, consumed on first presentation whatever it comes to, one
// live per host, and forgotten once they have been ended for as long as they lived.

import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_ENROLMENT_REFUSALS, ClientGatewayHostEnrolmentTickets } from "../index.ts";

const WEB = "web-automation";

function tickets() {
  const clock = { now: 1_000 };
  return { clock, table: new ClientGatewayHostEnrolmentTickets(() => clock.now) };
}

describe("ClientGatewayHostEnrolmentTickets", () => {
  it("mints an fxet_ ticket of 32 random bytes that expires after its ttl, 60 s by default", () => {
    const { table } = tickets();
    const first = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    const second = table.issue({ hostId: "host-2", domainId: WEB, profile: "named", ttlMs: 5_000 });
    expect(first.ticket).toMatch(/^fxet_[A-Za-z0-9_-]{43}$/u);
    expect(first.ticket).not.toBe(second.ticket);
    expect(first.expiresAt).toBe(61_000);
    expect(second.expiresAt).toBe(6_000);
  });

  it("redeems a live ticket once into its binding, and refuses it as used after that", () => {
    const { table } = tickets();
    const { ticket } = table.issue({ hostId: " host-1 ", domainId: WEB, profile: "named" });
    expect(table.redeem(ticket, WEB)).toEqual({ kind: "redeemed", binding: { hostId: "host-1", domainId: WEB, profile: "named" } });
    expect(table.redeem(ticket, WEB)).toEqual({ kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code, hostId: "host-1" });
  });

  it("refuses a ticket it never minted, and anything that is not a ticket, as unknown", () => {
    const { table } = tickets();
    table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    const unknown = { kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.code };
    expect(table.redeem("fxet_never-minted", WEB)).toEqual(unknown);
    expect(table.redeem("", WEB)).toEqual(unknown);
    expect(table.redeem(42, WEB)).toEqual(unknown);
  });

  it("refuses an expired ticket as expired, and consumes it doing so", () => {
    const { clock, table } = tickets();
    const { ticket, expiresAt } = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    clock.now = expiresAt;
    expect(table.redeem(ticket, WEB)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.expired.code });
    expect(table.redeem(ticket, WEB)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code });
  });

  it("refuses a ticket presented under another domain, and consumes it, so the right domain cannot try again", () => {
    const { table } = tickets();
    const { ticket } = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    expect(table.redeem(ticket, "desktop-automation")).toEqual({ kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.domainMismatch.code, hostId: "host-1" });
    expect(table.redeem(ticket, WEB)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code });
    const other = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    expect(table.redeem(other.ticket, null)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.domainMismatch.code });
  });

  it("keeps one live ticket per host: minting another revokes the one before, and only for that host", () => {
    const { table } = tickets();
    const first = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    const neighbour = table.issue({ hostId: "host-2", domainId: WEB, profile: "fresh" });
    const second = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    expect(table.redeem(first.ticket, WEB)).toEqual({ kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.revoked.code, hostId: "host-1" });
    expect(table.redeem(second.ticket, WEB)).toMatchObject({ kind: "redeemed" });
    expect(table.redeem(neighbour.ticket, WEB)).toMatchObject({ kind: "redeemed" });
  });

  it("revokes a host's live ticket on request, and says whether there was one", () => {
    const { table } = tickets();
    const { ticket } = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh" });
    expect(table.revokeForHost("host-1")).toBe(true);
    expect(table.revokeForHost("host-1")).toBe(false);
    expect(table.redeem(ticket, WEB)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.revoked.code });
  });

  it("forgets a ticket once it has been ended for as long as it lived, and then knows it no more", () => {
    const { clock, table } = tickets();
    const { ticket } = table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh", ttlMs: 1_000 });
    table.redeem(ticket, WEB);
    clock.now += 1_999;
    expect(table.redeem(ticket, WEB)).toMatchObject({ code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.used.code });
    clock.now += 1;
    expect(table.redeem(ticket, WEB)).toEqual({ kind: "refused", code: CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.code });
    expect(table.size()).toBe(0);
  });

  it("refuses to mint a ticket without a host, a domain, a known profile or a positive ttl", () => {
    const { table } = tickets();
    expect(() => table.issue({ hostId: " ", domainId: WEB, profile: "fresh" })).toThrow(/enrolment_host_required/u);
    expect(() => table.issue({ hostId: "host-1", domainId: "", profile: "fresh" })).toThrow(/enrolment_domain_required/u);
    expect(() => table.issue({ hostId: "host-1", domainId: WEB, profile: "kept" as "named" })).toThrow(/enrolment_profile_invalid/u);
    expect(() => table.issue({ hostId: "host-1", domainId: WEB, profile: "fresh", ttlMs: 0 })).toThrow(/enrolment_ttl_invalid/u);
  });
});
