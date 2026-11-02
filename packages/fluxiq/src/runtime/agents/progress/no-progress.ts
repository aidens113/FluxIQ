// Tracks observed states, repeated answers and repeated issue sets independently of any authoring workflow.
export type AutomationStudioLlmEvidenceNoProgress = {
  /** Steps in a row that gave the loop nothing new. */
  readonly steps: number;
  /** True once the guard is reached, which is when the caller ends the loop. */
  reached(): boolean;
  /** The loop learned something, so every run it was counting starts again. */
  cleared(): void;
  /** One more step that gave nothing new, named by the tool that gave it where a tool did. */
  stepped(toolId?: string): void;
  /** The first step of a new run of them: refused for something not seen since the last tool result. */
  restarted(): void;
  /** Whether an unusable decision's issues have been seen since the last tool result. Records them. */
  sameIssuesAgain(issueSet: string): boolean;
  /** A request answered from what the loop held: counted only when the model could already see that result. */
  answeredFromEvidence(answeredByCallId: string, toolId: string): void;
  /** What the last decision was shown, so a result brought back into view is told from one that never left. */
  shown(callIds: readonly string[]): void;
  /**
   * Whether this answer is one its own tool already gave, or, for a call that
   * applied an effect, whether the state it left is one the build was already
   * in. Records both either way.
   */
  answerRepeats(input: { toolId: string; answer: string; repeatedAnswer?: number | undefined; mutated: boolean; stateAfter?: string | undefined }): boolean;
  /**
   * Whether a completion refused for `issueSet` over the draft `signature` was
   * refused the same way before, since the draft last changed. Records it.
   * Not reset by a tool call, only by the draft changing.
   */
  refusedAgain(signature: string, issueSet: string): boolean;
  /** Record an answer nothing asked for, such as the loop's free first look. */
  answered(toolId: string, answer: string): void;
  /**
   * The model tried to finish and was refused for these issues. Kept until it
   * tries again, not until the next tool call: the refusal is what the
   * redirection has to keep naming, and on `run-mulum3x7-18ceeb75` it was said
   * once at iteration 20 and then lost for the fourteen decisions that circled it.
   */
  completionRefused(issueCodes: readonly string[]): void;
  /** The last refusal to finish, until the model tries to finish again: what a continuation still owes. */
  readonly outstanding: readonly string[];
  /**
   * Say plainly that this is going nowhere, when saying so is due. `now` says
   * it below `redirectAt`: a request answered from memory a second time has
   * already shown what the count would take more steps to learn: run 6 of
   * 2026-09-28 asked the same look eleven times, answered alike each time.
   */
  redirect(iteration: number, now?: boolean): void;
};


/** Opaque progress facts; a program supplies any message and candidate interpretation. */
export type AgentNoProgressSnapshot = {
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
  repeatingToolIds: string[];
  lastIssueCodes: readonly string[];
};

export function automationStudioLlmEvidenceNoProgress(input: {
  max: number;
  redirectAt: number;
  onRedirect(iteration: number, snapshot: AgentNoProgressSnapshot): void;
}): AutomationStudioLlmEvidenceNoProgress {
  let steps = 0;
  // The unusable issue sets seen since the last tool result; the tools whose
  // latest answer gave the loop nothing; the last answer each tool gave.
  const issueSets = new Set<string>();
  const repeating = new Set<string>();
  const lastAnswer = new Map<string, string>();
  // What the last decision was shown, and what has been brought back into view
  // since the last tool result. Asking once for a result that had left the
  // window is how the model sees it again, so only a second ask, or one for a
  // result it could already see, is a step without progress.
  let lastShown = new Set<string>();
  const broughtBack = new Set<string>();
  let lastRefusal: readonly string[] = [];
  // Every state a call left, for the life of the loop: a page seen once is
  // never new again. And the refusals seen per draft signature.
  const visited = new Set<string>();
  const refusals = new Map<string, Set<string>>();
  return {
    get steps() { return steps; },
    reached: () => steps >= input.max,
    cleared() {
      steps = 0;
      issueSets.clear();
      broughtBack.clear();
      repeating.clear();
    },
    stepped(toolId) {
      steps += 1;
      if (toolId !== undefined) repeating.add(toolId);
    },
    restarted() {
      steps = 1;
      repeating.clear();
    },
    sameIssuesAgain(issueSet) {
      if (issueSets.has(issueSet)) return true;
      issueSets.add(issueSet);
      return false;
    },
    answeredFromEvidence(answeredByCallId, toolId) {
      if (lastShown.has(answeredByCallId) || broughtBack.has(answeredByCallId)) {
        steps += 1;
        repeating.add(toolId);
      } else broughtBack.add(answeredByCallId);
    },
    shown(callIds) {
      lastShown = new Set(callIds);
    },
    answerRepeats({ toolId, answer, repeatedAnswer, mutated, stateAfter }) {
      const revisits = mutated && stateAfter !== undefined && visited.has(stateAfter);
      const repeats = revisits || (!mutated && (repeatedAnswer !== undefined || lastAnswer.get(toolId) === answer));
      lastAnswer.set(toolId, answer);
      if (stateAfter !== undefined) visited.add(stateAfter);
      return repeats;
    },
    refusedAgain(signature, issueSet) {
      const seen = refusals.get(signature);
      if (seen?.has(issueSet)) return true;
      refusals.clear();
      refusals.set(signature, new Set([...(seen ?? []), issueSet]));
      return false;
    },
    answered(toolId, answer) {
      lastAnswer.set(toolId, answer);
    },
    completionRefused(issueCodes) {
      lastRefusal = [...issueCodes];
    },
    get outstanding() { return [...lastRefusal]; },
    redirect(iteration, now) {
      if ((!now && steps < input.redirectAt) || steps >= input.max) return;
      input.onRedirect(iteration, {
        stepsWithoutProgress: steps,
        maxStepsWithoutProgress: input.max,
        repeatingToolIds: [...repeating],
        lastIssueCodes: lastRefusal
      });
    }
  };
}
