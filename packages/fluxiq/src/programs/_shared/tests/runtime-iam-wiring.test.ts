// The registry createGlobalProgramRuntime builds decides by the resolved
// profile: `local` as today, `service` by the attached policies with every
// decision audited, and `service` also bounds the gateway's ended sessions.

import { afterEach, describe, expect, it, vi } from "vitest";
import { IAM_USER_ACCESS } from "../../../platform/iam/predefined/index.ts";
import { MemoryIamAuditSink } from "../../../platform/iam/index.ts";
import { createGlobalProgramRuntime } from "../runtime.ts";
import { actor, ADMIN_PERMISSIONS, fixedPolicySource, VIEWER_PERMISSIONS } from "./iam-registry-fixtures.ts";

const alice = actor("alice", "user", ADMIN_PERMISSIONS);
const viewer = actor("viewer", "viewer", VIEWER_PERMISSIONS);

// Users are resolved without an owner lookup, so the live registry's own
// resolvers (which read storage) are never reached.
const OWN = { kind: "user", userId: "alice" } as const;
const OTHERS = { kind: "user", userId: "bob" } as const;
const SET_PIN = { action: "iam:SetPin", permission: "programs.read" } as const;
const EXPORT = { action: "studio:ExportProject", permission: "programs.read" } as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createGlobalProgramRuntime decides by profile", () => {
  it("decides as local with no FLUXIQ_PROFILE: permissions alone, no policy source needed", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "");
    const runtime = createGlobalProgramRuntime();
    try {
      await expect(runtime.api.authorize({ actor: alice, ...EXPORT, resources: OTHERS })).resolves.toMatchObject({ allowed: true });
      await expect(runtime.api.authorize({ actor: viewer, ...EXPORT, permission: "programs.write", resources: OTHERS })).resolves.toMatchObject({ allowed: false });
    } finally {
      runtime.detach();
    }
  });

  it("decides service by attached policies and records every decision", async () => {
    const audit = new MemoryIamAuditSink();
    const runtime = createGlobalProgramRuntime(undefined, { iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS]), audit } });
    try {
      await expect(runtime.api.authorize({ actor: alice, ...SET_PIN, resources: OWN })).resolves.toMatchObject({ allowed: true });
      await expect(runtime.api.authorize({ actor: alice, ...SET_PIN, resources: OTHERS })).resolves.toMatchObject({ allowed: false });
      await audit.flush();
      const decisions = audit.records.filter((record) => record.category !== "iam-change");
      expect(decisions.map((record) => record.decision)).toEqual(["allow", "deny"]);
      expect(decisions.map((record) => record.category)).toEqual(["allow", "deny"]);
      expect(decisions.every((record) => record.principal.endsWith("alice"))).toBe(true);
    } finally {
      runtime.detach();
    }
  });

  it("refuses everything under service with no source", async () => {
    const runtime = createGlobalProgramRuntime(undefined, { iam: { profile: "service" } });
    try {
      await expect(runtime.api.authorize({ actor: alice, ...SET_PIN, resources: OWN })).resolves.toMatchObject({ allowed: false });
    } finally {
      runtime.detach();
    }
  });
});

describe("FLUXIQ_PROFILE selects the profile", () => {
  async function endedSessionsAfterAnHour(): Promise<number> {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const runtime = createGlobalProgramRuntime();
    try {
      const first = runtime.clientGateway.connect();
      runtime.clientGateway.disconnect(first.sessionId, "socket closed");
      now += 3_600_001;
      const second = runtime.clientGateway.connect();
      runtime.clientGateway.disconnect(second.sessionId, "socket closed");
      return runtime.clientGateway.snapshot().sessions.filter((session) => session.status === "disconnected").length;
    } finally {
      runtime.detach();
    }
  }

  it("keeps ended sessions without an age bound locally", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "local");
    expect(await endedSessionsAfterAnHour()).toBe(2);
  });

  it("drops an ended session older than an hour under service, and decides by policy", async () => {
    vi.stubEnv("FLUXIQ_PROFILE", "service");
    expect(await endedSessionsAfterAnHour()).toBe(1);
    const runtime = createGlobalProgramRuntime();
    try {
      await expect(runtime.api.authorize({ actor: alice, ...SET_PIN, resources: OWN })).resolves.toMatchObject({ allowed: false });
    } finally {
      runtime.detach();
    }
  });
});
