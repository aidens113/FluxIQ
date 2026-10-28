import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";

type SiteChange = NonNullable<AutomationStudioRunResultSummary["siteChange"]>;
type Findings = NonNullable<AutomationStudioRunResultSummary["siteChangeFindings"]>;

/** What a text is said as where it may not be sent. */
const WITHHELD = "(withheld)";
/** The longest free text a finding carries, as the packet bounds its own (`automationStudioTrialSiteChangePacket`). */
const TEXT_CAP = 200;

/**
 * A trial's `siteChange` packet and Core's findings over it, made sendable
 * (`./index.ts`): every key is Core's own -- the packet carries no group,
 * scope, place, subject or state token, and no domain-named key a denied key
 * could be -- so what is screened is its text, the domain's readable lines and
 * the words of places, rows and acts. Each text that is credential-shaped is
 * said as `(withheld)`, and `withheld` says one was; the rest is sent as it
 * came, so a part's proof is never lost to one line. A finding's place is
 * bounded as the packet bounds its own.
 */
export function automationStudioResultSiteChangeScreened(input: {
  siteChange: SiteChange;
  findings?: readonly Findings[number][] | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
}): { siteChange: SiteChange; siteChangeFindings?: Findings; withheld: boolean } {
  const denied = input.deniedEvidenceKeys ?? [];
  const state = { withheld: false };
  const siteChange = screened(input.siteChange, denied, state) as SiteChange;
  const findings = (input.findings ?? []).map((finding) => screened(finding.code === "result.unasked_change" && finding.where !== undefined ? { ...finding, where: bounded(finding.where) } : finding, denied, state) as Findings[number]);
  return { siteChange, ...(findings.length ? { siteChangeFindings: findings } : {}), withheld: state.withheld };
}

/** `value` with each string that may not be sent said as withheld; keys are Core's and kept. */
function screened(value: unknown, denied: readonly string[], state: { withheld: boolean }): unknown {
  if (typeof value === "string") {
    if (!screenAutomationStudioLlmEvidence(value, denied).secretShaped) return value;
    state.withheld = true;
    return WITHHELD;
  }
  if (Array.isArray(value)) return value.map((item) => screened(item, denied, state));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, screened(item, denied, state)]));
  return value;
}

function bounded(text: string): string {
  return text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP - 1)}…` : text;
}
