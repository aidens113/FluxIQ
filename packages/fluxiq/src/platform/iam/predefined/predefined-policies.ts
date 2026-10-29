import { IAM_ADMINISTRATOR_ACCESS } from "./administrator-access.ts";
import { IAM_CONNECTED_SESSION } from "./connected-session.ts";
import { IAM_OWNER_FULL_ACCESS } from "./owner-full-access.ts";
import type { IamPredefinedPolicyDefinition } from "./predefined-policy-definition.ts";
import { IAM_PROVISIONER } from "./provisioner.ts";
import { IAM_READ_ONLY_ACCESS } from "./read-only-access.ts";
import { IAM_SERVICE_GUARDRAIL } from "./service-guardrail.ts";
import { IAM_USER_ACCESS } from "./user-access.ts";

/** Every predefined policy's document, in the order of the contract's `IAM_PREDEFINED_POLICIES`. */
export const IAM_PREDEFINED_POLICY_DEFINITIONS: readonly IamPredefinedPolicyDefinition[] = Object.freeze([
  IAM_OWNER_FULL_ACCESS,
  IAM_ADMINISTRATOR_ACCESS,
  IAM_READ_ONLY_ACCESS,
  IAM_USER_ACCESS,
  IAM_CONNECTED_SESSION,
  IAM_PROVISIONER,
  IAM_SERVICE_GUARDRAIL
]);
