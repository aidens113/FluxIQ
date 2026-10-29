import { randomUUID } from "node:crypto";
import { IAM_PLATFORM_ADMIN_PRINCIPAL } from "@fluxiq/contracts/iam";
import { IamStoreError } from "../../iam/index.ts";
import type { IamChangeContext, IamStore } from "../../iam/index.ts";

const PROVISIONER_POLICY = "FluxIQProvisioner";

/**
 * Makes sure the platform-level service identity `name` exists with
 * `FluxIQProvisioner` attached, creating either when missing; returns its
 * FRN. Safe to run at every start, and beside another process doing the
 * same: the store's `already_exists` and `already_attached` refusals mean
 * the other got there first, and every other failure propagates.
 */
export async function ensureProvisionerIdentity(iam: Pick<IamStore, "getServiceIdentity" | "createServiceIdentity" | "principalFrn" | "listAttachedPolicies" | "attachPolicy">, name: string): Promise<string> {
  const change: IamChangeContext = { actor: IAM_PLATFORM_ADMIN_PRINCIPAL, origin: "provisioning", requestId: randomUUID(), matched: { policy: "platform-admin", sid: null } };
  if ((await iam.getServiceIdentity(name)) === null) {
    try {
      await iam.createServiceIdentity(name, change);
    } catch (error) {
      if (!(error instanceof IamStoreError && error.code === "already_exists")) throw error;
    }
  }
  const frn = iam.principalFrn("service-identity", name);
  if (!(await iam.listAttachedPolicies(frn)).includes(PROVISIONER_POLICY)) {
    try {
      await iam.attachPolicy(frn, PROVISIONER_POLICY, change);
    } catch (error) {
      if (!(error instanceof IamStoreError && error.code === "already_attached")) throw error;
    }
  }
  return frn;
}
