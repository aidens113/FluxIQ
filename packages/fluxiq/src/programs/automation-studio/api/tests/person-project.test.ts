// @fluxiq-test-group real-sql
// Which project a person's browser works in when none is chosen: theirs, by who owns it, and never
// another person's. Through the real wiring, on both profiles. A first one is made through the
// registry, with its check and its owner.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FluxIQHostPaths } from "../../../../framework/index.ts";
import { IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { createGlobalProgramRuntime, type GlobalProgramRuntime } from "../../../index.ts";
import type { ProgramApiActor } from "../../../_shared/api.ts";
import { fixedPolicySource } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { automationStudioPersonProject } from "../person-project.ts";

const DOMAIN = "example";
const OPERATOR_PERMISSIONS = ["programs.read", "programs.write", "runtime.control", "flows.write"] as ProgramApiActor["permissions"];

function person(userId: string): ProgramApiActor {
  return { userId, sessionId: `client-gateway:${userId}`, roleId: "viewer", permissions: OPERATOR_PERMISSIONS, channel: "paired-client" };
}

const ALICE = person("user.alice");
const BOB = person("user.bob");

function pathsAt(root: string): FluxIQHostPaths {
  const fluxiq = path.join(root, ".fluxiq");
  return {
    root, fluxiq, config: path.join(fluxiq, "config.json"), data: path.join(fluxiq, "data"), databases: path.join(fluxiq, "databases"),
    inputs: path.join(fluxiq, "inputs"), outputs: path.join(fluxiq, "outputs"), streams: path.join(fluxiq, "streams"), domains: path.join(fluxiq, "domains"),
    domainPrograms: path.join(fluxiq, "domain-programs"), domainInputs: path.join(fluxiq, "domain-inputs"), domainOutputs: path.join(fluxiq, "domain-outputs")
  } as FluxIQHostPaths;
}

describe.each([
  ["local", { profile: "local" as const }],
  ["service", { profile: "service" as const, source: fixedPolicySource([IAM_USER_ACCESS]) }]
])("a person's browser with no project chosen, on the %s profile", (_profile, iam) => {
  let root = "";
  let runtime: GlobalProgramRuntime;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-person-project-"));
    runtime = createGlobalProgramRuntime(pathsAt(root), { modelProvidersEnabled: false, iam });
    await runtime.identityAccess.upsertUser({ id: ALICE.userId, username: "alice", displayName: "Alice", roleId: "viewer" });
    await runtime.identityAccess.upsertUser({ id: BOB.userId, username: "bob", displayName: "Bob", roleId: "viewer" });
  });
  afterEach(async () => {
    runtime.secretKeys.close();
    runtime.detach();
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const project = (actor: ProgramApiActor, create?: boolean) => automationStudioPersonProject({ registry: runtime.api, actor, domainId: DOMAIN, ...(create ? { create } : {}) });
  const allProjects = async () => (await runtime.automationStudio.listProjects(DOMAIN)).projects;
  const made = async (actor: ProgramApiActor, name: string): Promise<string> => {
    const answer = await runtime.api.call({ programId: "automation-studio", endpoint: "create-project", scope: { domainId: DOMAIN }, actor, payload: { name } }) as { ok: boolean; error?: string; payload?: { project?: { id: string } } };
    expect(answer.ok, answer.error).toBe(true);
    return answer.payload?.project?.id ?? "";
  };

  it("is never another person's, however recent", async () => {
    await made(BOB, "Bob's");
    await expect(project(ALICE)).resolves.toBeNull();
  });

  it("is never a project nobody claimed, which is the administrator's", async () => {
    await runtime.automationStudio.createProject({ name: "Old", domainId: DOMAIN });
    await expect(project(ALICE)).resolves.toBeNull();
  });

  it("is their own latest, past someone else's newer one", async () => {
    const first = await made(ALICE, "Older");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await made(ALICE, "Newer");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await made(BOB, "Bob's");
    expect(second).not.toBe(first);
    await expect(project(ALICE)).resolves.toBe(second);
  });

  it("reading makes nothing", async () => {
    await expect(project(ALICE)).resolves.toBeNull();
    await expect(allProjects()).resolves.toEqual([]);
  });

  it("a first one is theirs, recorded as theirs, and only one however many ask at once", async () => {
    const bobs = await made(BOB, "Bob's");
    const answers = await Promise.all([project(ALICE, true), project(ALICE, true), project(ALICE, true)]);
    expect(answers[0]).toBeTruthy();
    expect(new Set(answers).size).toBe(1);
    await expect(allProjects()).resolves.toHaveLength(2);
    await expect(project(ALICE)).resolves.toBe(answers[0]);
    await expect(project(BOB)).resolves.toBe(bobs);
    await expect(project(ALICE, true)).resolves.toBe(answers[0]);
    await expect(allProjects()).resolves.toHaveLength(2);
  });

  it("its maker can reach it, and on the service profile nobody else can", async () => {
    const own = await project(ALICE, true);
    const reach = (actor: ProgramApiActor) => runtime.api.call({ programId: "automation-studio", endpoint: "update-project", scope: { domainId: DOMAIN }, actor, payload: { projectId: own, name: "Renamed" } });
    await expect(reach(ALICE)).resolves.toMatchObject({ ok: true });
    await expect(reach(BOB)).resolves.toMatchObject({ ok: iam.profile === "local" });
  });

  it("is refused by the registry for someone who may not make one", async () => {
    const reader: ProgramApiActor = { ...ALICE, permissions: ["programs.read"] as ProgramApiActor["permissions"] };
    await expect(project(reader, true)).resolves.toBeNull();
    await expect(allProjects()).resolves.toEqual([]);
  });

  it("with no domain declared, is none", async () => {
    await expect(automationStudioPersonProject({ registry: runtime.api, actor: ALICE, domainId: null, create: true })).resolves.toBeNull();
    await expect(allProjects()).resolves.toEqual([]);
  });
});
