// Which attempts are at work in this process, per service (design, "Carry on and interrupted").
// A row says `working` because the last thing written said so; only this says anyone is still
// doing it. It is memory on purpose: a Core that restarted knows of nothing, which is exactly what
// makes every unfinished row it finds an interrupted one.
//
// **A press claims an attempt before it reads anything**, so two presses at once cannot both
// start it. `releases` is how a reader tells that an attempt ended while it was reading
// (`./attempts-read.ts`).

export type AutomationStudioAnswerFirstLiveAttempts = {
  /** Marks it live. False where it already was. */
  claim(attemptId: string): boolean;
  /** It is over, however it ended. */
  release(attemptId: string): void;
  has(attemptId: string): boolean;
  /** How many attempts have stopped being live so far. */
  releases(): number;
};

const LIVE = new WeakMap<object, AutomationStudioAnswerFirstLiveAttempts>();

/** The service's live attempts, made on first ask. */
export function automationStudioAnswerFirstLiveAttemptsOf(owner: object): AutomationStudioAnswerFirstLiveAttempts {
  const known = LIVE.get(owner);
  if (known) return known;
  const attempts = new Set<string>();
  let released = 0;
  const made: AutomationStudioAnswerFirstLiveAttempts = {
    claim(attemptId) {
      if (attempts.has(attemptId)) return false;
      attempts.add(attemptId);
      return true;
    },
    release(attemptId) {
      if (attempts.delete(attemptId)) released += 1;
    },
    has: (attemptId) => attempts.has(attemptId),
    releases: () => released
  };
  LIVE.set(owner, made);
  return made;
}
