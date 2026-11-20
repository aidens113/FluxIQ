// @fluxiq-test-group real-sql
// The docker driver over a fake `docker` command line: every resource
// labelled for its project and environment, the runner locked down, the
// enrolment ticket only ever on a relay's standard input, idempotent
// operations by operation id through the controller, and cleanup after a
// failed allocation, a failed enrolment and a crash.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dedicatedEnvironmentTarget, DEDICATED_ENVIRONMENT_CAPABILITY, EnvironmentController } from "../../runtime/index.ts";
import type { CommerceAdmissionDecision } from "../../../commerce/index.ts";
import { SQLiteEnvironmentStore } from "../../storage/index.ts";
import { DockerEnvironmentDriver } from "../index.ts";
import type { DockerEnvironmentDriverOptions } from "../index.ts";
import { FakeDocker } from "./fake-docker.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const spec = { environmentId: "env-1", accountId: "account-a", workspaceId: "workspace-a" };
const AUTHORITY = "-----BEGIN CERTIFICATE-----\nMIIBlocal\n-----END CERTIFICATE-----\n";

function driverOver(docker: FakeDocker, overrides: Partial<DockerEnvironmentDriverOptions> = {}): DockerEnvironmentDriver {
  return new DockerEnvironmentDriver({
    docker,
    project: "fluxiq-local",
    image: "fluxiq-cloud/runner:0.1.0",
    network: "fluxiq-local_runners",
    reach: { publicOrigin: "https://app.fluxiq.localhost", gatewayUrl: "wss://app.fluxiq.localhost/client", resolveOriginTo: "host.docker.internal", readAuthority: async () => AUTHORITY },
    limits: { memory: "1g", cpus: "1", pids: 512 },
    stopTimeoutSeconds: 20,
    ...overrides
  });
}

/** A ticket source that mints a fresh ticket per call, as the tenant's gateway does. */
function tickets(): { takeEnrolmentTicket(): string; minted: string[] } {
  const minted: string[] = [];
  const takeEnrolmentTicket = (): string => {
    const ticket = `fxet_secret_${minted.length + 1}_${"q".repeat(30)}`;
    minted.push(ticket);
    return ticket;
  };
  return { minted, takeEnrolmentTicket };
}

describe("the docker environment driver", () => {
  it("allocates a labelled volume and a locked-down container on the runners network, without starting it", async () => {
    const docker = new FakeDocker();
    const driver = driverOver(docker);
    expect(await driver.inspect(spec)).toBe("absent");
    await driver.allocate(spec);
    expect(await driver.inspect(spec)).toBe("stopped");
    const volume = docker.volumes.get("fluxiq-local-env-env-1-profile");
    expect(volume && Object.fromEntries(volume.labels)).toEqual({ "com.fluxiq.cloud.project": "fluxiq-local", "com.fluxiq.cloud.environment": "env-1", "com.fluxiq.cloud.role": "environment" });
    const [container] = [...docker.containers.values()];
    expect(container?.name).toBe("fluxiq-local-env-env-1");
    expect(Object.fromEntries(container!.labels)).toEqual({ "com.fluxiq.cloud.project": "fluxiq-local", "com.fluxiq.cloud.environment": "env-1", "com.fluxiq.cloud.role": "environment" });
    const args = container!.createArgs;
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect([value("--network"), value("--cap-drop"), value("--security-opt"), value("--memory"), value("--cpus"), value("--pids-limit")])
      .toEqual(["fluxiq-local_runners", "ALL", "no-new-privileges:true", "1g", "1", "512"]);
    expect(args).toContain("--read-only");
    expect(args).toContain("type=volume,source=fluxiq-local-env-env-1-profile,target=/profile");
    for (const flag of ["--publish", "-p", "--privileged", "--volume", "-v", "--restart"]) expect(args).not.toContain(flag);
    expect(args.some((arg) => arg.startsWith("type=bind"))).toBe(false);
    expect(args).toContain("FLUXIQ_RUNNER_GATEWAY_URL=wss://app.fluxiq.localhost/client");
    expect(args).toContain(`FLUXIQ_RUNNER_AUTHORITY=${AUTHORITY}`);
    expect(args[args.length - 1]).toBe("fluxiq-cloud/runner:0.1.0");
  });

  it("starts the runner and hands it each ticket on a relay's standard input, never in an argument, label or the container's environment", async () => {
    const docker = new FakeDocker();
    docker.relay = (ask) => {
      ask();
      ask();
      return { stdout: ["ticket", "ticket", "connected"], code: 0 };
    };
    const driver = driverOver(docker);
    const source = tickets();
    await driver.allocate(spec);
    await driver.start(spec, source);
    expect(await driver.inspect(spec)).toBe("running");
    expect(source.minted).toHaveLength(2);
    expect(docker.stdin).toEqual(source.minted);
    const visible = docker.visibleText();
    for (const ticket of source.minted) expect(visible).not.toContain(ticket);
    expect(visible).not.toContain("fxet_");
    expect(docker.calls).toContainEqual(["exec", "--interactive", "fluxiq-local-env-env-1", "fluxiq-runner", "enrol"]);
  });

  it("stops a runner that did not enrol, so it never looks converged, and reports why without the ticket", async () => {
    const docker = new FakeDocker();
    docker.relay = (ask) => {
      ask();
      return { stdout: ["ticket"], code: 3, stderr: "browser-host: the gateway refused the enrolment (enrolment.unknown)" };
    };
    const driver = driverOver(docker);
    const source = tickets();
    await driver.allocate(spec);
    const failure = await driver.start(spec, source).catch((error: Error) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("enrolment.unknown");
    expect((failure as Error).message).not.toContain(source.minted[0]!);
    expect(await driver.inspect(spec)).toBe("stopped");
  });

  it("refuses to start without a ticket source", async () => {
    const driver = driverOver(new FakeDocker());
    await driver.allocate(spec);
    await expect(driver.start(spec)).rejects.toThrow(/without an enrolment ticket source/u);
  });

  it("reports one resource without the other as partial, and releases everything by label", async () => {
    const docker = new FakeDocker();
    docker.failures.set("create", "Error response from daemon: no such image");
    const driver = driverOver(docker);
    await expect(driver.allocate(spec)).rejects.toThrow(/no such image/u);
    expect(await driver.inspect(spec)).toBe("partial");
    await driver.release(spec);
    expect(await driver.inspect(spec)).toBe("absent");
    await driver.release(spec);
    expect(await driver.inspect(spec)).toBe("absent");
  });

  it("finds only its own project's and environment's resources", async () => {
    const docker = new FakeDocker();
    await driverOver(docker).allocate(spec);
    await driverOver(docker, { project: "other-project" }).allocate(spec);
    await driverOver(docker).allocate({ ...spec, environmentId: "env-2" });
    await driverOver(docker).release(spec);
    expect([...docker.containers.values()].map((container) => container.name).sort()).toEqual(["fluxiq-local-env-env-2", "other-project-env-env-1"]);
    expect([...docker.volumes.keys()].sort()).toEqual(["fluxiq-local-env-env-2-profile", "other-project-env-env-1-profile"]);
  });

  it("refuses an environment id that is not one, before calling Docker", async () => {
    const docker = new FakeDocker();
    await expect(driverOver(docker).allocate({ ...spec, environmentId: "../escape" })).rejects.toThrow(TypeError);
    expect(docker.calls).toEqual([]);
  });
});

describe("the docker driver under the controller", () => {
  async function world() {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-docker-environments-"));
    roots.push(rootDir);
    const docker = new FakeDocker();
    const driver = driverOver(docker);
    const store = new SQLiteEnvironmentStore({ rootDir, now: () => 2_000 });
    const owner = { accountId: "account-a", workspaceId: "workspace-a" };
    const authority = (environmentId: string) => ({
      principalId: "principal-a", accountId: owner.accountId, workspaceId: owner.workspaceId,
      target: dedicatedEnvironmentTarget({ environmentId, ...owner }, "local"),
      cloudAuthorization: owner
    });
    const revoked: string[] = [];
    const source = tickets();
    const controller = new EnvironmentController<string>({
      store,
      driver,
      admission: {
        admit: async (request): Promise<CommerceAdmissionDecision> => ({
          allowed: true, source: "commerce", allocation: "dedicated", principalId: "principal-a", accountId: owner.accountId, workspaceId: request.workspaceId, targetId: request.targetId,
          capability: DEDICATED_ENVIRONMENT_CAPABILITY, policyId: "test", entitlementKey: "cloud.dedicated", providerId: "fake", subscriptionId: "sub-a", subscriptionVersion: 1, validUntilMs: 10_000
        })
      },
      authorize: async (request) => authority(request.targetId),
      enrolment: {
        open: async () => ({ takeEnrolmentTicket: () => source.takeEnrolmentTicket(), close: () => undefined }),
        revoke: async (target) => { revoked.push(target.environmentId); }
      }
    });
    const run = (kind: "create" | "start" | "stop" | "delete", operationId: string, environmentId = "env-1") =>
      controller[kind]({ operationId, environmentId, workspaceId: owner.workspaceId, actor: "principal-a" });
    return { docker, store, controller, run, revoked, source };
  }

  it("creates, stops, starts and deletes idempotently by operation id", async () => {
    const w = await world();
    expect(await w.run("create", "op-1")).toMatchObject({ driver: "docker", desired: "running", observed: "running" });
    const creates = w.docker.calls.filter((call) => call[0] === "create").length;
    expect(await w.run("create", "op-1")).toMatchObject({ observed: "running" });
    expect(w.docker.calls.filter((call) => call[0] === "create")).toHaveLength(creates);
    expect(await w.run("stop", "op-2")).toMatchObject({ desired: "stopped", observed: "stopped" });
    expect(w.revoked).toEqual(["env-1"]);
    expect(await w.run("start", "op-3")).toMatchObject({ desired: "running", observed: "running" });
    expect(await w.run("delete", "op-4")).toMatchObject({ desired: "deleted", observed: "deleted" });
    expect(w.docker.containers.size + w.docker.volumes.size).toBe(0);
    expect(await w.run("delete", "op-4")).toMatchObject({ observed: "deleted" });
    const visible = w.docker.visibleText();
    for (const ticket of w.source.minted) expect(visible).not.toContain(ticket);
  });

  it("releases a failed allocation's partial resources, and the same create then succeeds", async () => {
    const w = await world();
    w.docker.failures.set("create", "Error response from daemon: no such image");
    await expect(w.run("create", "op-1")).rejects.toThrow(/no such image/u);
    expect(w.docker.volumes.size + w.docker.containers.size).toBe(0);
    expect(await w.store.get("env-1")).toMatchObject({ desired: "running", observed: "absent" });
    expect(await w.run("create", "op-1")).toMatchObject({ observed: "running" });
  });

  it("starts a crashed runner again on reconcile, with a new ticket", async () => {
    const w = await world();
    await w.run("create", "op-1");
    w.docker.crash("fluxiq-local-env-env-1");
    expect(await w.controller.reconcile("env-1")).toMatchObject({ desired: "running", observed: "running" });
    expect(w.source.minted).toHaveLength(2);
  });

  it("purges an account's environments, containers and volumes", async () => {
    const w = await world();
    await w.run("create", "op-1");
    await w.run("create", "op-2", "env-2");
    expect((await w.controller.purgeAccount("account-a", "receipt-1")).sort()).toEqual(["env-1", "env-2"]);
    expect(w.docker.containers.size + w.docker.volumes.size).toBe(0);
    expect(await w.store.listByAccount("account-a")).toEqual([]);
  });
});
