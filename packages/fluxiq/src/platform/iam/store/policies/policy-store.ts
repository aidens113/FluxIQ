import { IAM_PREDEFINED_POLICIES, type IamPolicyKind } from "@fluxiq/contracts/iam";
import { assertNotPredefined, assertPolicyName } from "../assert/index.ts";
import type { IamChangeContext, IamStoreScope } from "../context/index.ts";
import { IamStoreError } from "../errors/index.ts";
import { IAM_MAX_POLICY_VERSIONS } from "../limits/index.ts";
import { parsePolicyDocument } from "../parse/index.ts";
import type { IamPolicyVersion, IamStoredPolicy } from "../records/index.ts";
import { policyUsers } from "./policy-users.ts";

/** Customer-managed policies and their versions. */
export class IamPolicyStore {
  private readonly scope: IamStoreScope;

  constructor(scope: IamStoreScope) {
    this.scope = scope;
  }

  async create(name: string, kind: IamStoredPolicy["kind"], document: unknown, context: IamChangeContext): Promise<IamStoredPolicy> {
    assertPolicyName(name);
    assertNotPredefined(name);
    if ((await this.get(name)) !== null) throw new IamStoreError("policy_exists", `Policy ${name} already exists.`);
    const nowMs = this.scope.now();
    const policy: IamStoredPolicy = {
      name,
      kind,
      defaultVersionId: "v1",
      nextVersionNumber: 2,
      versions: [{ id: "v1", document: parsePolicyDocument(document, kind), createdAtMs: nowMs }],
      createdAtMs: nowMs,
      updatedAtMs: nowMs
    };
    await this.scope.records.put("policy", name, policy);
    this.scope.audit(context, "iam:CreatePolicy", [this.scope.policyFrn(name)]);
    return policy;
  }

  async get(name: string): Promise<IamStoredPolicy | null> {
    return this.scope.records.get<IamStoredPolicy>("policy", name);
  }

  async list(): Promise<IamStoredPolicy[]> {
    return this.scope.records.list<IamStoredPolicy>("policy");
  }

  async createVersion(name: string, document: unknown, makeDefault: boolean, context: IamChangeContext): Promise<IamPolicyVersion> {
    assertNotPredefined(name);
    const policy = await this.require(name);
    if (policy.versions.length >= IAM_MAX_POLICY_VERSIONS) {
      throw new IamStoreError("version_limit", `Policy ${name} already has ${IAM_MAX_POLICY_VERSIONS} versions; delete one first.`);
    }
    const version: IamPolicyVersion = { id: `v${policy.nextVersionNumber}`, document: parsePolicyDocument(document, policy.kind), createdAtMs: this.scope.now() };
    const next: IamStoredPolicy = {
      ...policy,
      versions: [...policy.versions, version],
      nextVersionNumber: policy.nextVersionNumber + 1,
      defaultVersionId: makeDefault ? version.id : policy.defaultVersionId,
      updatedAtMs: this.scope.now()
    };
    await this.scope.records.put("policy", name, next);
    this.scope.audit(context, "iam:CreatePolicyVersion", [this.scope.policyFrn(name)]);
    return version;
  }

  async setDefaultVersion(name: string, versionId: string, context: IamChangeContext): Promise<void> {
    assertNotPredefined(name);
    const policy = await this.require(name);
    if (!policy.versions.some((version) => version.id === versionId)) {
      throw new IamStoreError("version_not_found", `Policy ${name} has no version ${versionId}.`);
    }
    await this.scope.records.put("policy", name, { ...policy, defaultVersionId: versionId, updatedAtMs: this.scope.now() });
    this.scope.audit(context, "iam:SetDefaultPolicyVersion", [this.scope.policyFrn(name)]);
  }

  async deleteVersion(name: string, versionId: string, context: IamChangeContext): Promise<void> {
    assertNotPredefined(name);
    const policy = await this.require(name);
    if (!policy.versions.some((version) => version.id === versionId)) {
      throw new IamStoreError("version_not_found", `Policy ${name} has no version ${versionId}.`);
    }
    if (policy.defaultVersionId === versionId) {
      throw new IamStoreError("default_version", `Version ${versionId} is the default of ${name}; make another version the default first.`);
    }
    const versions = policy.versions.filter((version) => version.id !== versionId);
    await this.scope.records.put("policy", name, { ...policy, versions, updatedAtMs: this.scope.now() });
    this.scope.audit(context, "iam:DeletePolicyVersion", [this.scope.policyFrn(name)]);
  }

  async delete(name: string, context: IamChangeContext): Promise<void> {
    assertNotPredefined(name);
    await this.require(name);
    const users = await policyUsers(this.scope, name);
    if (users.length > 0) {
      throw new IamStoreError("policy_attached", `Policy ${name} is still attached to ${users.join(", ")}; detach it first.`);
    }
    await this.scope.records.remove("policy", name);
    this.scope.audit(context, "iam:DeletePolicy", [this.scope.policyFrn(name)]);
  }

  /** Throws unless `name` is a predefined or customer-managed policy of `kind`. */
  async requireKind(name: string, kind: IamPolicyKind): Promise<void> {
    const predefined = IAM_PREDEFINED_POLICIES.find((policy) => policy.name === name);
    const actual = predefined?.kind ?? (await this.get(name))?.kind;
    if (actual === undefined) throw new IamStoreError("policy_not_found", `Policy ${name} does not exist.`);
    if (actual !== kind) throw new IamStoreError("policy_kind_mismatch", `Policy ${name} is a ${actual} policy; a ${kind} policy is required here.`);
  }

  private async require(name: string): Promise<IamStoredPolicy> {
    const policy = await this.get(name);
    if (policy === null) throw new IamStoreError("policy_not_found", `Policy ${name} does not exist.`);
    return policy;
  }
}
