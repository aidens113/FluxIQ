import { defineIamPredefinedPolicy } from "./define-predefined-policy.ts";

/**
 * `FluxIQProvisioner`: the website's platform-level provisioning service
 * identity.
 *
 * - `ProvisionAccounts`: `platform:*Account*` (creating accounts, setting
 *   their policies, adding members, as the provisioning actions are named) on
 *   account FRNs, `frn:fluxiq:platform::account/*`. No `platform` action is
 *   registered yet, so this grants nothing today.
 * - `DenyWorkspaceContent`: an explicit `Deny *` on every FRN with a
 *   workspace segment (`frn:fluxiq:*:?*:*`: the `?` needs at least one
 *   character between the two colons, so a platform-level FRN, whose segment
 *   is empty, is not matched) and on every workspace's own FRN. So even if the
 *   provisioner were also given a workspace policy, it could never read or
 *   change a workspace's projects, keys, browsers, members or programs.
 */
export const IAM_PROVISIONER = defineIamPredefinedPolicy("FluxIQProvisioner", "v1", [
  { Sid: "ProvisionAccounts", Effect: "Allow", Action: "platform:*Account*", Resource: "frn:fluxiq:platform::account/*" },
  { Sid: "DenyWorkspaceContent", Effect: "Deny", Action: "*", Resource: ["frn:fluxiq:*:?*:*", "frn:fluxiq:platform::workspace/*"] }
]);
