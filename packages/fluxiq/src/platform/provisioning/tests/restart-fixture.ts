import { createHash } from "node:crypto";
import { vi } from "vitest";
import { MemoryIamAuditSink } from "../../iam/index.ts";
import { IdentityAccessService } from "../../../programs/identity-access/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import type { PlatformServices } from "../service/index.ts";
import type { PlatformProvisioningCaller } from "../types.ts";
import { accountInput } from "./provisioning-fixture.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";
import { TestClock } from "./test-clock.ts";

// Test support for a simulated server restart: rows that outlive a process,
// and `boot`, which starts a process over them with the real identity-access
// service. A new process holds every credential sealed and not unlocked,
// which is the state after a restart and in the offline command line. Dummy
// values only; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };

export const OLD_PASSWORD = "the first dummy password";
export const NEW_PASSWORD = "the second dummy password";
export const EMAIL = "person@example.test";
export const IN_PROCESS: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };

/** What survives a restart: the platform and identity rows, the outbox, the audit and the clock. */
export type RestartRows = { platform: MemoryRecordRepository; identity: MemoryRecordRepository; email: MemoryEmailSender; audit: MemoryIamAuditSink; clock: TestClock };

/** One server process: its identity service and its platform services. */
export type RestartServer = { identity: IdentityAccessService; services: PlatformServices };

export function restartRows(): RestartRows {
  return { platform: new MemoryRecordRepository(), identity: new MemoryRecordRepository(), email: new MemoryEmailSender(), audit: new MemoryIamAuditSink(), clock: new TestClock() };
}

/** One server process over the shared rows; calling it again is a restart. */
export async function boot(shared: RestartRows): Promise<RestartServer> {
  const identity = new IdentityAccessService({ repository: shared.identity, passwordKdf: WEAK_KDF });
  const services = await createPlatformServices({
    repository: shared.platform,
    iamRepository: shared.platform,
    identity,
    email: shared.email,
    auditSink: shared.audit,
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" },
    now: () => shared.clock.nowMs
  });
  return { identity, services };
}

/** An account created in-process with `OLD_PASSWORD`, so its credential is sealed in the identity rows. */
export async function accountWithPassword(server: RestartServer, sendWelcome: boolean): Promise<string> {
  const answer = await server.services.provisioning.run("createAccount", accountInput({ password: OLD_PASSWORD, sendWelcome }), IN_PROCESS);
  if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
  return answer.result.userId;
}

/** Turns two-factor sign-in on for the account (no secret is needed for a sealed-credential test). */
export async function enableTwoFactor(server: RestartServer, userId: string): Promise<void> {
  await server.identity.upsertUser({ id: userId, username: EMAIL, displayName: "A Person", roleId: "viewer", totpEnabled: true });
}

export function digestOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signsInWith(server: RestartServer, password: string): Promise<boolean> {
  return server.identity.authenticate({ username: EMAIL, password }).then(() => true, () => false);
}

/** Captures every console call from now on, as text; restored by `vi.restoreAllMocks()`. */
export function captureConsole(): string[] {
  const logged: string[] = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    });
  }
  return logged;
}
