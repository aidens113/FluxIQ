import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { FluxIQ } from "fluxiq";
import { handleProgramRequest } from "fluxiq/server";
import { MemoryIamAuditSink } from "fluxiq/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTenantFluxIQ, FluxIQWorkspaceManager, sessionWorkspaceId, workspaceIam } from "../../../lib/workspaces";
import { DurableLoginAttemptTracker } from "../../../lib/login-attempts";
import { submitOwnerClaim } from "../../../app/setup/server";
import { claimOwner, ownerClaimPaths, prepareOwnerClaim, readOwnerClaimMarker } from "../index";
import { createOwnerClaimInstance, type OwnerClaimInstance } from "./owner-claim-instance";

const PASSWORD = "synthetic first-account password";
const FORM = { username: " First.Admin@Example.TEST ", displayName: "First administrator", password: PASSWORD };
let instance: OwnerClaimInstance;
const lines: string[] = [];
const failure = vi.hoisted(() => ({ marker: false }));

vi.mock("../write-private-file", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../write-private-file")>();
  return {
    writePrivateFile: async (filePath: string, content: string) => {
      if (failure.marker && filePath.endsWith("owner-claim.json")) {
        failure.marker = false;
        throw new Error("Synthetic marker write failure");
      }
      await actual.writePrivateFile(filePath, content);
    }
  };
});

beforeEach(async () => {
  // A service root made before new stores started empty: it still holds admin/admin, which the claim retires.
  // A fresh service root's claim is in `claim-owner.test.ts`.
  instance = await createOwnerClaimInstance({ profile: "service", start: "old-root" });
  lines.length = 0;
  failure.marker = false;
});
afterEach(async () => instance.close());

function deps() {
  return { settings: instance.settings(), fluxiqDir: instance.fluxiqDir, provisioning: instance.services.provisioning, identityAccess: instance.fluxiq.programs.identityAccess, log: (line: string) => lines.push(line) };
}

describe("first service administrator with real multi-tenancy provisioning", () => {
  it("creates a sign-in-ready personal tenant administrator without a primary or platform owner grant", { timeout: 60_000 }, async () => {
    await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
    const claimed = await claimOwner(FORM, deps());
    expect(claimed).toMatchObject({ ok: true, defaultAdmin: "deleted" });
    if (!claimed.ok) throw new Error("Expected a completed service claim.");
    const auth = await instance.fluxiq.programs.identityAccess.authenticate({ username: "first.admin@example.test", password: PASSWORD });
    expect(auth.user).toMatchObject({ id: claimed.userId, username: "first.admin@example.test", roleId: "admin", enabled: true });
    const workspaces = await instance.services.store.listWorkspaces();
    expect(workspaces).toHaveLength(1);
    const workspace = workspaces[0]!;
    expect(workspace).toMatchObject({ kind: "personal", ownerUserId: claimed.userId });
    expect(workspace.workspaceId).not.toBe("workspace-main");
    expect((await instance.services.store.getMembership(workspace.workspaceId, claimed.userId))?.policies).toEqual(["FluxIQAdministratorAccess"]);
    expect(await instance.services.store.getMembership("workspace-main", claimed.userId)).toBeNull();
    expect((await instance.services.store.getAccount(claimed.userId))?.emailVerifiedAtMs).toBeNull();
    expect(await readOwnerClaimMarker(instance.fluxiqDir)).toMatchObject({ ownerUserId: claimed.userId });
    await expect(stat(ownerClaimPaths(instance.fluxiqDir).generatedCode)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(instance.fluxiq.programs.identityAccess.authenticate({ username: "admin", password: "admin" })).rejects.toThrow();
    for (const line of lines) expect(line).not.toContain(PASSWORD);
    const forbidden = await instance.services.provisioning.run("createAccount", { requestId: "forbidden-owner-policy-probe", email: "forbidden@example.test", displayName: "Refused account", policies: ["FluxIQOwnerFullAccess"], workspace: "new" }, { kind: "in-process", actorUserId: null, transport: "in-process" });
    expect(forbidden).toMatchObject({ ok: false, error: { code: "forbidden_policy" } });
    expect(await instance.services.store.listWorkspaces()).toHaveLength(1);
  });

  it("submits setup, signs in, and reaches only its own real tenant through primary session routing", { timeout: 60_000 }, async () => {
    await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
    const code = (await readFile(ownerClaimPaths(instance.fluxiqDir).generatedCode, "utf8")).trim();
    const tracker = (name: string) => new DurableLoginAttemptTracker(path.join(instance.fluxiqDir, "security", name), { windowMs: 600_000, lockoutMs: 60_000, maxAttempts: 10 });
    const request = new Request("https://fluxiq.example.test/setup/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, ...FORM, confirmation: PASSWORD }) });
    const result = await submitOwnerClaim(request, { ...deps(), restoreKeys: async () => undefined, attempts: { global: tracker("service-setup-global.json"), address: tracker("service-setup-address.json") } });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, redirectTo: "/" });
    const sessionId = result.session?.id;
    expect(sessionId).toBeTruthy();
    const auth = await instance.fluxiq.programs.identityAccess.validateSession(sessionId);
    expect(auth?.user.username).toBe("first.admin@example.test");
    expect((await instance.services.store.getAccount(auth!.user.id))?.lastSignInAtMs).not.toBeNull();

    const manager = new FluxIQWorkspaceManager({
      tenancy: "multi",
      primaryWorkspaceId: "workspace-main",
      createPrimary: () => instance.fluxiq,
      createTenant: ({ workspaceId, heldKeys, primary }) => createTenantFluxIQ({
        workspaceId, heldKeys, dataRoot: primary.paths.root, env: {},
        iam: workspaceIam("multi", workspaceId, { platformServices: async () => instance.services, audit: new MemoryIamAuditSink() }),
        instantiate: (options) => FluxIQ.create({ ...options, modelProvidersEnabled: false })
      }),
      sweepIntervalMs: 0
    });
    try {
      const workspaceId = await sessionWorkspaceId({ sessionId: sessionId!, manager, platformServices: async () => instance.services });
      expect(workspaceId).toBeTruthy();
      expect(workspaceId).not.toBe("workspace-main");
      const own = await manager.acquire(workspaceId!);
      try {
        expect(own.fluxiq).not.toBe(instance.fluxiq);
        expect(own.fluxiq.paths.root).not.toBe(instance.fluxiq.paths.root);
        const routeRequest = { method: "GET" as const, url: "https://fluxiq.example.test/api/programs/secret-keys/snapshot", programId: "secret-keys", endpoint: "snapshot", sessionId, authorization: null, readJson: async () => undefined };
        const response = await handleProgramRequest(routeRequest, { fluxiq: own.fluxiq, identityAuthority: instance.fluxiq.programs.identityAccess });
        expect(response.status).toBe(200);
        const another = await instance.services.provisioning.run("createAccount", { requestId: "another-customer", email: "another@example.test", displayName: "Another customer", policies: ["FluxIQAdministratorAccess"], workspace: "new" }, { kind: "in-process", actorUserId: null, transport: "in-process" });
        expect(another.ok).toBe(true);
        if (!another.ok || another.result.status !== "created") throw new Error("Expected another isolated tenant.");
        const foreign = await manager.acquire(another.result.workspaceId);
        try {
          expect((await handleProgramRequest(routeRequest, { fluxiq: foreign.fluxiq, identityAuthority: instance.fluxiq.programs.identityAccess })).status).toBe(403);
        } finally {
          foreign.release();
        }
      } finally {
        own.release();
      }
    } finally {
      await manager.close();
    }
    for (const secret of [PASSWORD, code]) expect(JSON.stringify(result.body) + lines.join("\n")).not.toContain(secret);
  });

  it("makes exactly one administrator and personal tenant from repeated concurrent claims", { timeout: 60_000 }, async () => {
    const [first, second] = await Promise.all([claimOwner(FORM, deps()), claimOwner({ ...FORM, username: "rival@example.test" }, deps())]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, code: "already_claimed" });
    expect(await claimOwner(FORM, deps())).toEqual({ ok: false, code: "already_claimed" });
    expect(await instance.services.store.listWorkspaces()).toHaveLength(1);
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users).toHaveLength(1);
  });

  it("keeps the marker/code/default admin untouched on rejected creation, then accepts a corrected claim", { timeout: 60_000 }, async () => {
    await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
    const paths = ownerClaimPaths(instance.fluxiqDir);
    const code = await readFile(paths.generatedCode, "utf8");
    expect(await claimOwner({ ...FORM, password: "short" }, deps())).toEqual({ ok: false, code: "weak_password" });
    expect(await claimOwner({ ...FORM, username: "not-an-email" }, deps())).toEqual({ ok: false, code: "invalid_input", fields: ["username"] });
    expect(await readOwnerClaimMarker(instance.fluxiqDir)).toBeNull();
    expect(await readFile(paths.generatedCode, "utf8")).toBe(code);
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users.map((user) => user.id)).toEqual(["admin"]);
    expect(await instance.services.store.listWorkspaces()).toEqual([]);
    expect((await claimOwner(FORM, deps())).ok).toBe(true);
  });

  it("reuses the successful account/tenant after a marker failure without claiming a failed attempt", { timeout: 60_000 }, async () => {
    await prepareOwnerClaim({ settings: instance.settings(), fluxiqDir: instance.fluxiqDir });
    failure.marker = true;
    expect(await claimOwner(FORM, deps())).toEqual({ ok: false, code: "claim_failed" });
    expect(await readOwnerClaimMarker(instance.fluxiqDir)).toBeNull();
    await expect(stat(ownerClaimPaths(instance.fluxiqDir).generatedCode)).resolves.toBeDefined();
    const before = await instance.services.store.listWorkspaces();
    expect(before).toHaveLength(1);
    const retried = await claimOwner(FORM, deps());
    expect(retried.ok).toBe(true);
    expect(await instance.services.store.listWorkspaces()).toEqual(before);
    expect((await instance.fluxiq.programs.identityAccess.snapshot()).users).toHaveLength(1);
    expect((await instance.fluxiq.programs.identityAccess.authenticate({ username: "first.admin@example.test", password: PASSWORD })).user.id).toBe(retried.ok ? retried.userId : "");
  });
});
