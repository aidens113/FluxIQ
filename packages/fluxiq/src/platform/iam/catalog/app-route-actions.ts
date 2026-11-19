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
  }
] satisfies IamRouteRegistration[]);
