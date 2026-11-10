// A press grant confirms exactly one call: the one its person's press was for,
// once, within a minute. Every binding is tried on its own here.

import { describe, expect, it } from "vitest";
import { PressGrantStore } from "../press-grant-store.ts";
import type { PressGrantBinding } from "../types.ts";

const binding: PressGrantBinding = {
  sessionId: "session.raw.one",
  actorId: "user.one",
  programId: "automation-studio",
  endpoint: "delete-flow",
  payload: { projectId: "project.one", flowId: "flow.old" }
};

function clocked(start = 1_000_000): { store: PressGrantStore; advance(ms: number): void } {
  let now = start;
  return { store: new PressGrantStore({ now: () => now }), advance: (ms) => { now += ms; } };
}

describe("press grant store", () => {
  it("mints 32 random bytes as base64url that last 60 seconds, a different grant each press", () => {
    const { store } = clocked();
    const first = store.mint(binding, "press");
    const second = store.mint(binding, "press");
    expect(first.grant).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(first.grant, "base64url")).toHaveLength(32);
    expect(first.expiresAt).toBe(1_000_000 + 60_000);
    expect(second.grant).not.toBe(first.grant);
  });

  it("confirms its own call once, and refuses the replay", () => {
    const { store } = clocked();
    const { grant } = store.mint(binding, "press");
    expect(store.consume(grant, binding)).toBe(true);
    expect(store.consume(grant, binding)).toBe(false);
  });

  it("still confirms at 59 seconds and refuses at 61", () => {
    const early = clocked();
    const kept = early.store.mint(binding, "press").grant;
    early.advance(59_000);
    expect(early.store.consume(kept, binding)).toBe(true);

    const late = clocked();
    const expired = late.store.mint(binding, "press").grant;
    late.advance(61_000);
    expect(late.store.consume(expired, binding)).toBe(false);
  });

  it("refuses the grant with another payload, however small the change", () => {
    const { store } = clocked();
    const other = { ...binding, payload: { projectId: "project.one", flowId: "flow.precious" } };
    expect(store.consume(store.mint(binding, "press").grant, other)).toBe(false);
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, payload: { ...(binding.payload as object), alsoDeleteRuns: true } })).toBe(false);
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, payload: {} })).toBe(false);
  });

  it("refuses the grant on another endpoint, program, session or actor", () => {
    const { store } = clocked();
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, endpoint: "delete-project" })).toBe(false);
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, programId: "secret-keys" })).toBe(false);
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, sessionId: "session.raw.two" })).toBe(false);
    expect(store.consume(store.mint(binding, "press").grant, { ...binding, actorId: "user.two" })).toBe(false);
  });

  it("spends a grant presented with the wrong binding, so it cannot then be used for its own call", () => {
    const { store } = clocked();
    const { grant } = store.mint(binding, "press");
    expect(store.consume(grant, { ...binding, endpoint: "delete-project" })).toBe(false);
    expect(store.consume(grant, binding)).toBe(false);
  });

  it("reads the payload as the wire would: key order, the route's session and the grant field do not change it", () => {
    const { store } = clocked();
    const { grant } = store.mint({ ...binding, payload: { projectId: "project.one", flowId: "flow.old" } }, "press");
    expect(store.consume(grant, { ...binding, payload: { flowId: "flow.old", projectId: "project.one", authSessionId: "session.raw.one", pressGrant: grant } })).toBe(true);
  });

  it("names the endpoint as the registry looks it up", () => {
    const { store } = clocked();
    const { grant } = store.mint(binding, "press");
    expect(store.consume(grant, { ...binding, programId: " Automation-Studio ", endpoint: "DELETE-FLOW" })).toBe(true);
  });

  it("refuses what is not a grant without looking it up, and a well-formed grant it never minted", () => {
    const { store } = clocked();
    store.mint(binding, "press");
    for (const presented of [undefined, null, 42, {}, "", "short", "x".repeat(10_000)]) expect(store.consume(presented, binding)).toBe(false);
    expect(store.consume(Buffer.alloc(32, 7).toString("base64url"), binding)).toBe(false);
  });

  it("keeps at most 16 unused grants per session, dropping that session's oldest", () => {
    const { store } = clocked();
    const minted = Array.from({ length: 17 }, () => store.mint(binding, "press").grant);
    const otherSession = { ...binding, sessionId: "session.raw.two" };
    const others = store.mint(otherSession, "press").grant;
    expect(store.consume(minted[0], binding)).toBe(false);
    for (const grant of minted.slice(1)) expect(store.consume(grant, binding)).toBe(true);
    expect(store.consume(others, otherSession)).toBe(true);
  });
});
