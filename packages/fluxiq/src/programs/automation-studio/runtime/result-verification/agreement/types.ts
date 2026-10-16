import type { AutomationStudioResultReadAccount, AutomationStudioResultRecordSetSummary, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import type { AutomationStudioRequestWording } from "../request-rows/index.ts";

/** What one call that judged `does_not_answer` said. */
export type JudgeReading = NonNullable<AutomationStudioResultVerification["unconfirmedReading"]>;

export type AutomationStudioResultVerificationAgreementInput = {
  /** The verdict the first call reached. */
  first: AutomationStudioResultVerification;
  /** The verdict the second call reached, asked only when `automationStudioResultVerificationAskAgain` said so. */
  second?: AutomationStudioResultVerification | undefined;
  /** True when a first `answers` is confirmed by a second call (the build-test judge). */
  confirmAnswer?: boolean | undefined;
  /**
   * Core's own account of each list read of the judged result
   * (`AutomationStudioRunResultSummary.reads`): what a reading that says there
   * are more pages is weighed against on a double no (t501). Absent, no reading
   * is marked.
   */
  reads?: readonly AutomationStudioResultReadAccount[] | undefined;
  /**
   * The judged result's record sets (`AutomationStudioRunResultSummary.recordSets`):
   * each one's `sortRead` is what a reading that denies an order is weighed
   * against on a double no (t511). Absent, no reading is marked for order.
   */
  recordSets?: readonly AutomationStudioResultRecordSetSummary[] | undefined;
  /**
   * The request as the judges read it (`request-rows/request-wording.ts`): what
   * a split's no's advice is held to, and its call asked once more where the
   * advice excludes by words the request never states (t515). Absent, no
   * advice is marked.
   */
  wording?: AutomationStudioRequestWording | undefined;
  /**
   * The judged summary itself (`AutomationStudioRunResultSummary`), and the
   * request's text: Core's record a no's reasons are weighed against
   * (`../refuted-no/`, t607). Absent, no no is weighed and every no stands.
   */
  summary?: AutomationStudioRunResultSummary | undefined;
  requestText?: string | undefined;
};

/** What `automationStudioResultVerificationReaskContradicted` is given: the agreement's input, what the two calls came to, and how to ask one again. */
export type ReaskContradictedInput = AutomationStudioResultVerificationAgreementInput & {
  settled: AutomationStudioResultVerification;
  /** Asks call `call` once more, its copy carrying `recheck`. */
  ask: (recheck: string, call: 1 | 2) => Promise<AutomationStudioResultVerification>;
};
