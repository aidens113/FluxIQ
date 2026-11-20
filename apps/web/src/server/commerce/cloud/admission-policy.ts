import type { CommerceAdmissionPolicy } from "fluxiq/platform";
import type { CommerceConfig } from "../types";

const ALLOCATIONS = ["control", "shared", "dedicated"] as const;

/** The policy id cloud admission records on every decision it allows. */
const POLICY_ID = "commerce.configuration";

/**
 * Cloud admission's policy from the SAME commerce configuration billing runs
 * on, so the two cannot disagree: grace, trial and verification age come from
 * the file. Each allocation class's entitlement key is the key the plans'
 * grants of that class carry (one key per class: two would make admission
 * guess); a class no plan grants gets Core's conventional `cloud.<class>`,
 * which no grant matches, so it admits nothing.
 */
export function cloudAdmissionPolicy(config: CommerceConfig): CommerceAdmissionPolicy {
  if (config.maxVerificationAgeMs <= config.refreshAfterMs) {
    throw new Error(`commerce.configuration: maxVerificationAgeMs (${config.maxVerificationAgeMs}) must exceed refreshAfterMs (${config.refreshAfterMs}).`);
  }
  const keys: Record<string, string> = {};
  for (const allocation of ALLOCATIONS) {
    const granted = new Set<string>();
    for (const plan of Object.values(config.plans)) for (const line of plan.lines) for (const grant of line.grants) if (grant.allocation === allocation) granted.add(grant.key);
    if (granted.size > 1) throw new Error(`commerce.configuration: plans grant ${allocation} under more than one key (${[...granted].join(", ")}); admission needs one.`);
    keys[allocation] = [...granted][0] ?? `cloud.${allocation}`;
  }
  return {
    id: POLICY_ID,
    maxVerificationAgeMs: config.maxVerificationAgeMs,
    allowTrial: config.allowTrial,
    graceMs: config.graceMs,
    entitlementKeys: { control: keys.control!, shared: keys.shared!, dedicated: keys.dedicated! }
  };
}
