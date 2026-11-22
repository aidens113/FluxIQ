// The one builder of what every judge is shown of how a result was got (t963, J1): the run's or the attempt's own
// record of every look, read and act, each with what the domain answered, in the order they ran, numbered, screened
// (`./screen.ts`) and with its reading (`./note.ts`). Its three sources are Core's records of each kind of judged work:
// an attempt's calls (`./of/call.ts`), a finished run's traced attempts (`./of/attempts.ts`) and a build test's
// observations (`./of/observations.ts`).
//
// **Nothing is cut.** Every step is shown, with everything its answer held; only a page view an earlier step already
// showed, byte for byte, is a reference to it (`./repeats.ts`, t978). Only where a request would not fit the
// judging model's window are steps' findings summarised, and after everything else (`./fitting.ts`, and the
// Flow-less judge's own `../flow-less/window-fitting.ts`).

import type { AutomationStudioResultTrail, AutomationStudioResultTrailShownStep, AutomationStudioResultTrailStep } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_TRAIL_NOTE } from "./note.ts";
import { automationStudioResultTrailRepeatsOnce } from "./repeats.ts";
import { automationStudioResultTrailScreened } from "./screen.ts";
import { automationStudioJudgeEvidenceFinding } from "../judge-evidence/finding.ts";
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";
import { AutomationStudioJudgeEvidenceRetry } from "../judge-evidence/retry.ts";

/** The trail a judge is shown, or none for no steps; `withheld` where anything in it was screened. Absent `deniedEvidenceKeys`, nobody declared them, and nothing is carried. */
export function automationStudioResultRunTrail(steps: readonly AutomationStudioResultTrailStep[] | undefined, deniedEvidenceKeys: readonly string[] | undefined): { trail?: AutomationStudioResultTrail; withheld: boolean } {
  if (!steps?.length) return { withheld: false };
  if (deniedEvidenceKeys === undefined) return { withheld: true };
  let withheld = false;
  const screened = (value: Parameters<typeof automationStudioResultTrailScreened>[0]) => {
    const shown = automationStudioResultTrailScreened(value, deniedEvidenceKeys);
    if (shown.withheld) withheld = true;
    return shown.value;
  };
  const words = (text: string | undefined): string | undefined => {
    const shown = text === undefined || !text.trim() ? undefined : screened(text.trim());
    return typeof shown === "string" && shown ? shown : undefined;
  };
  const shown = steps.map((step, at): AutomationStudioResultTrailShownStep => {
    const hasSemantic = Object.hasOwn(step, "judgeEvidence");
    const on = words(step.on);
    const asked = screened(step.asked);
    const outcome = words(step.outcome);
    const where = words(step.where);
    const found = screened(step.found);
    const callId = !hasSemantic ? words(step.callId) : automationStudioResultEvidenceScreen({ ...(step.callId === undefined ? {} : { callId: step.callId }) }, deniedEvidenceKeys).value.callId;
    const framework = step.framework === undefined ? undefined : automationStudioResultEvidenceScreen(step.framework, deniedEvidenceKeys);
    const semantic = hasSemantic ? automationStudioJudgeEvidenceFinding(step.judgeEvidence, deniedEvidenceKeys) : undefined;
    withheld ||= framework?.withheld === true || semantic?.ok === false || (semantic?.ok === true && semantic.finding.withheld);
    const result: AutomationStudioResultTrailShownStep = {
      n: at + 1,
      ...(typeof callId === "string" ? { callId } : {}),
      did: words(step.did) ?? "(withheld)",
      ...(on !== undefined ? { on } : {}),
      ...(asked !== undefined ? { asked } : {}),
      ...(outcome !== undefined ? { outcome } : {}),
      ...(where !== undefined ? { where } : {}),
      ...(found !== undefined ? { found } : {}),
      ...(framework === undefined ? {} : { framework: framework.value }),
      ...(step.judgeSource === undefined ? {} : { judgeSource: structuredClone(step.judgeSource) }),
      ...(step.judgeSources === undefined ? {} : { judgeSources: structuredClone(step.judgeSources) }),
      ...(step.judgeAct === undefined ? {} : { judgeAct: structuredClone(step.judgeAct) }),
      ...(semantic === undefined ? {} : { judgeEvidence: semantic.ok ? semantic.finding : { version: 1 as const, missing: [semantic.code], withheld: true } })
    };
    AutomationStudioJudgeEvidenceRetry.carry(step, result);
    return result;
  });
  return { trail: { note: AUTOMATION_STUDIO_RESULT_TRAIL_NOTE, entries: automationStudioResultTrailRepeatsOnce(shown) }, withheld };
}
