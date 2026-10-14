import type { ClientGatewayActivityPhase, ClientGatewayActivityProjectCard } from "@fluxiq/contracts/client-gateway";
import type { AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../../project-agents/contracts/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioProjectCardWords } from "./card-words.ts";
import { automationStudioProjectSubflowName } from "./subflow-name.ts";
import { automationStudioProjectSubflowPurpose } from "./subflow-purpose.ts";

/** What a dispatched brief's card is made from. */
export type AutomationStudioProjectBriefCardInput = {
  brief: AutomationStudioProjectSubflowBrief;
  structurePlan: AutomationStudioProjectStructurePlan;
  taskSpec: AutomationStudioProjectTaskSpec;
  /** The supervisor's own one-line purpose for this subflow, where it wrote one. */
  purpose?: string;
  phase?: ClientGatewayActivityPhase;
};

const VERBS = Object.freeze({ build: "Building", survey: "Surveying", repair: "Repairing", reset: "Resetting" } satisfies Record<AutomationStudioProjectSubflowBrief["kind"], string>);

/** A reset is of the site, not of a subflow: what the person reads before the judged whole run. */
const RESET_WORDS = "Resetting the site to where the build started";

/** A run of hex as long as a digest's: a brief id shaped like one is never a row's ref. */
const DIGEST_LIKE = /[a-f0-9]{32,}/iu;

/**
 * Says in the chat that the supervisor dispatched a brief: "Building <subflow>:
 * <purpose>" (or Surveying, Repairing; a reset says "Resetting the site to
 * where the build started") as a `note` row whose card names the
 * brief, its subflow, its starting case and its allowance. The row's ref is
 * the brief id, so a client can put the builder's own steps under it.
 */
export function emitAutomationStudioProjectBriefCard(input: AutomationStudioProjectBriefCardInput): void {
  const { brief, structurePlan, taskSpec } = input;
  const subflowName = automationStudioProjectSubflowName(brief.subflowKey, structurePlan);
  const purpose = automationStudioProjectSubflowPurpose(brief.subflowKey, structurePlan, taskSpec, input.purpose);
  const card: ClientGatewayActivityProjectCard = {
    kind: "brief",
    briefId: brief.briefId,
    brief: brief.kind,
    subflowKey: brief.subflowKey,
    subflowName,
    purpose,
    caseId: brief.entry.caseId,
    allowanceUsd: brief.allowanceUsd
  };
  const title = automationStudioProjectCardWords(brief.kind === "reset" ? RESET_WORDS : `${VERBS[brief.kind]} ${subflowName}: ${purpose}`, 160);
  emitAutomationStudioActivity({
    phase: input.phase ?? (brief.kind === "repair" ? "repairing" : "building"),
    label: automationStudioProjectCardWords(brief.kind === "reset" ? RESET_WORDS : `${VERBS[brief.kind]} ${subflowName}`, 160),
    detail: { kind: "note", title, status: "started", ...(DIGEST_LIKE.test(brief.briefId) ? {} : { ref: brief.briefId }), project: card }
  });
}
