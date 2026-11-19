// Covers programs/_shared/paired-client/permissions.ts with its two users: the program route's
// paired actor (server/program-route/paired-client-actor.ts) and the key-access authority's own
// paired actor (programs/_shared/key-access/authority.ts). Both narrow a person's role by the same
// one set (t955), so a change to what a paired client may hold reaches every paired actor at once,
// and no copy of the set is left to drift.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { localSecretKeyUseAuthority } from "../programs/_shared/key-access/index.ts";
import { PAIRED_CLIENT_PERMISSIONS } from "../programs/_shared/paired-client/index.ts";
import { pairedClientActor } from "../server/program-route/index.ts";

/** Every permission a role can hold, the ones no paired actor may carry first. */
const EVERY_PERMISSION = ["secrets.manage", "identity.manage", "data.manage", "compute.control", "programs.read", "programs.write", "flows.write", "runtime.control"];
const directory = { users: [{ id: "owner", roleId: "admin", enabled: true }], roles: [{ id: "admin", permissions: EVERY_PERMISSION }] };

/** The actor the key-access authority builds for a trusted client of `owner`, as IAM is asked to decide it. */
async function keyAccessClientActor(): Promise<{ permissions: string[]; channel?: string }> {
  const authorize = vi.fn(async (_request: { actor: { permissions: string[]; channel?: string } }) => ({ allowed: true }));
  const authority = localSecretKeyUseAuthority({
    identity: { snapshot: async () => directory },
    gateway: { vouchesForClient: async () => true },
    keys: {},
    api: { authorize },
    resolveStanding: async () => null,
  } as unknown as Parameters<typeof localSecretKeyUseAuthority>[0]);
  await authority({ principal: { kind: "client", userId: "owner", trustedClientId: "client" }, key: { id: "key", createdBy: "owner" } } as Parameters<typeof authority>[0]);
  expect(authorize).toHaveBeenCalledTimes(1);
  return authorize.mock.calls[0]![0].actor;
}

describe("the one set of permissions a paired client keeps", () => {
  it("is what both paired actors keep of an administrator's role, and nothing more", async () => {
    const wanted = [...PAIRED_CLIENT_PERMISSIONS].sort();
    expect(wanted).toEqual(["flows.write", "programs.read", "programs.write", "runtime.control"]);
    const routeActor = pairedClientActor({ sessionId: "g1", operatorUserId: "owner" }, directory);
    const keyActor = await keyAccessClientActor();
    expect(routeActor?.channel).toBe("paired-client");
    expect(keyActor.channel).toBe("paired-client");
    expect([...(routeActor?.permissions ?? [])].sort()).toEqual(wanted);
    expect([...keyActor.permissions].sort()).toEqual(wanted);
  });

  it("is written once: no other source file under src declares it", () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const home = path.join(src, "programs", "_shared", "paired-client", "permissions.ts");
    // Any array literal holding exactly these four, in any order, is a copy of the set.
    const permission = `"(?:${PAIRED_CLIENT_PERMISSIONS.map((name) => name.replace(".", "\\.")).join("|")})"`;
    const literal = new RegExp(`\\[\\s*${permission}(?:\\s*,\\s*${permission}){3}\\s*,?\\s*\\]`, "gu");
    const copies: string[] = [];
    (function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "tests" && name !== "node_modules") walk(full);
        } else if (name.endsWith(".ts") && full !== home) {
          for (const match of readFileSync(full, "utf8").matchAll(literal)) {
            if (new Set(match[0].match(/"[^"]+"/gu)).size === 4) copies.push(`${path.relative(src, full)}: ${match[0]}`);
          }
        }
      }
    })(src);
    expect(copies).toEqual([]);
  });
});
