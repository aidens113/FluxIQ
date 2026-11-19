import type { IamRouteRegistration } from "./route-registration.ts";

/**
 * The app route actions registered in the catalog, so the policy editor and
 * the simulator know them. The web app's route IAM table checks that each is
 * the action its route is decided by.
 */
export const IAM_APP_ROUTE_ACTIONS: readonly IamRouteRegistration[] = Object.freeze([
  {
    action: "iam:GetBillingStatus",
    method: "GET",
    path: "/api/platform/v1/commerce/checkout",
    accessLevel: "Read",
    destructive: false,
    description: "Reads the workspace's hosted plans and billing: its state, dedicated browsers, seats and open checkout."
  },
  {
    action: "iam:StartCheckout",
    method: "POST",
    path: "/api/platform/v1/commerce/checkout",
    accessLevel: "Write",
    destructive: false,
    description: "Starts a payment checkout of one configured hosted plan for the workspace's paying account."
  },
  {
    action: "iam:ListEnvironments",
    method: "GET",
    path: "/api/platform/v1/environments",
    accessLevel: "List",
    destructive: false,
    description: "Lists the workspace's dedicated browser environments and their states."
  },
  {
    action: "iam:CreateEnvironment",
    method: "POST",
    path: "/api/platform/v1/environments",
    accessLevel: "Write",
    destructive: false,
    description: "Creates and starts a dedicated browser environment, admitted only by the paying account's plan."
  },
  {
    action: "iam:StartEnvironment",
    method: "POST",
    path: "/api/platform/v1/environments/[environmentId]/start",
    accessLevel: "Write",
    destructive: false,
    description: "Starts one of the workspace's stopped dedicated browser environments, admitted by the paying account's plan."
  },
  {
    action: "iam:StopEnvironment",
    method: "POST",
    path: "/api/platform/v1/environments/[environmentId]/stop",
    accessLevel: "Write",
    destructive: false,
    description: "Stops one of the workspace's dedicated browser environments, keeping its browser profile."
  },
  {
    action: "iam:DeleteEnvironment",
    method: "DELETE",
    path: "/api/platform/v1/environments/[environmentId]",
    accessLevel: "Write",
    destructive: true,
    description: "Deletes one of the workspace's dedicated browser environments, its browser profile and its client's trust."
  }
] satisfies IamRouteRegistration[]);
