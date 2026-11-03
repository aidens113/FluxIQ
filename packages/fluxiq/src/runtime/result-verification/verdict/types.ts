import type { AutomationStudioLlmDiagnosisFields } from "../../llm/index.ts";
import type { AutomationStudioResultVerdictBasis, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestWording } from "../request-rows/index.ts";

export type AutomationStudioResultVerdictInput = {
  summary: AutomationStudioRunResultSummary;
  /** The diagnosis fields the verification call returned, when it returned any. */
  diagnosis?: AutomationStudioLlmDiagnosisFields | undefined;
  /**
   * The reply's own prose summary, read only as the judgement's advice and only
   * where `diagnosis.changed` gave none.
   *
   * It is the field a model fills without being told which of them to fill, so a
   * judgement that put its whole reading in the summary is not thrown away for
   * having chosen the wrong box. Nothing is required of it: absent, empty or
   * unusable, the refutation stands on Core's own findings.
   */
  summaryText?: string | undefined;
  /** How the verdict was reached: `model` when a reply arrived, otherwise why not. */
  basis: Exclude<AutomationStudioResultVerdictBasis, "core_observation" | "model_disagreed" | "model_unconfirmed">;
  /**
   * The diagnostic code of a call that did not come back usable. Codes only,
   * never a message. Kept on the verification as `failureCode`; the reason a
   * person reads says what happened in words instead.
   */
  failureCode?: string | undefined;
  /**
   * The request as the judge read it (`request-rows/request-wording.ts`): where
   * given, a yes over a row a condition alone left out has to quote, beside
   * that row, the request's own words that exclude it (header, t515). Absent,
   * a yes is read as before.
   */
  wording?: AutomationStudioRequestWording | undefined;
};
