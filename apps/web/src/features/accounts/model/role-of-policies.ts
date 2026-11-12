import type { AccountRole } from "./types";

const BY_POLICY: Readonly<Record<string, AccountRole>> = Object.freeze({
  FluxIQOwnerFullAccess: "owner",
  FluxIQAdministratorAccess: "administrator",
  FluxIQReadOnlyAccess: "read-only",
  FluxIQUserAccess: "member"
});

const RANK: readonly AccountRole[] = ["owner", "administrator", "member", "read-only"];

/** The role a membership's attached policies amount to: the strongest one it holds, or `other` when none is known. */
export function roleOfPolicies(policies: readonly string[]): AccountRole {
  const held = new Set(policies.flatMap((name) => (Object.hasOwn(BY_POLICY, name) ? [BY_POLICY[name] as AccountRole] : [])));
  return RANK.find((role) => held.has(role)) ?? "other";
}
