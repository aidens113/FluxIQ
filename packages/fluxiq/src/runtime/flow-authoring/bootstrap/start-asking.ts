// Asked when the task starts, never in the middle (t976, F21).
//
// The user's rule (2026-11-03, 2026-11-10): a dangerous act asks "ONLY WHEN FIRST STARTING A
// FLOW/CHAT", never in the middle of a Flow; the lead's MVP decision: one plain question, never
// again in the same chat. A caller that keeps to it (an answer-first attempt) calls `start` before
// anything acts: it hands over the answer the chat already holds and the classes the task needs --
// those the chat's own reading declared (`../../conversations/instructions/acts.ts`), or those the
// chat kept from an earlier start -- and puts the one question about whatever is still unanswered
// (`../../action-permission-requests/task-start.ts`). No model call is made for it.
//
// A caller that does not call `start` itself (a legacy, candidate or project build) gives a source
// instead (`startFrom`): it is read once, before the first call the domain is handed or the first
// check, and the start runs then, still before anything acts.
//
// Asking closes with that one question. A saved Flow contributes every declared class before the
// question is put, so its individual checks cannot open further questions. After it, a gated class nobody foresaw is refused unasked:
// the domain is told nobody can be asked (`requestId: null`), the class is told to `unforeseen` so
// the chat asks about it when the task starts again, and the thread is told so once, in plain
// words. Every answer a person gives is told to `heard`, for the chat to hold. Until `start` is
// called nothing here changes how the gate asks (`./action-permissions.ts`).

import { automationStudioDestructiveConsequences, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence, type AutomationStudioActionPermissionGate, type AutomationStudioActionPermissionRequest, type AutomationStudioActionPermissionVerdict } from "../../action-permission-requests/index.ts";
import type { AutomationStudioPermissionAskOutcome } from "../../automation-parking/index.ts";
import { automationStudioFlowBootstrapUnforeseenSaid } from "./unforeseen-said.ts";

/** One answer a person gave to a question the gate put to them: what a chat holds. */
export type AutomationStudioFlowBootstrapPermissionHeard = {
  outcome: "granted" | "declined";
  /** The gated classes the question was about. */
  classes: readonly AutomationStudioActionConsequence[];
  requestId: string;
  /** Whether it was the task's own question when it started, rather than one press's or step's. */
  taskStart: boolean;
};

/** What a chat already holds of the person's answer, handed to the gate before anything is checked. */
export type AutomationStudioFlowBootstrapHeldPermission = { granted: readonly string[]; declined: readonly string[]; requestId: string | null };

/** How the start of a task went. */
export type AutomationStudioFlowBootstrapStartPermission = {
  /** The gated classes the instruction needs, or `undefined` when they are not known (no read, or a read that failed). */
  classes: readonly AutomationStudioActionConsequence[] | undefined;
  /** The question put to the person, when one was. */
  asked?: AutomationStudioActionPermissionRequest | undefined;
  outcome?: AutomationStudioPermissionAskOutcome | undefined;
};

/** What a task's start is given: the chat's held answer, the classes the task needs, and whether to ask at all. */
export type AutomationStudioFlowBootstrapStartRequest = { held?: AutomationStudioFlowBootstrapHeldPermission | undefined; classes?: readonly string[] | undefined; ask: boolean };

export class AutomationStudioFlowBootstrapStartAsking {
  private started = false;
  private closed = false;
  /** The classes the start covered: asked about, or already answered in the chat. */
  private readonly foreseen = new Set<AutomationStudioActionConsequence>();
  private readonly told = new Set<AutomationStudioActionConsequence>();

  constructor(private readonly input: {
    gate: AutomationStudioActionPermissionGate;
    /** Puts one request to a person; absent, there is nobody to ask. */
    ask?: ((request: AutomationStudioActionPermissionRequest) => Promise<AutomationStudioPermissionAskOutcome>) | undefined;
    /** Where the start comes from when the caller does not call `start` itself (header); read once, before anything acts. */
    startFrom?: (() => Promise<AutomationStudioFlowBootstrapStartRequest>) | undefined;
    /** Told how a start from `startFrom` went, so the caller keeps what it learned. */
    started?: ((start: AutomationStudioFlowBootstrapStartPermission, request: AutomationStudioFlowBootstrapStartRequest) => unknown) | undefined;
    /** The requests already put to a person, shared with the gate's own asking. */
    asked: Set<string>;
    heard?: ((answer: AutomationStudioFlowBootstrapPermissionHeard) => unknown) | undefined;
    unforeseen?: ((classes: readonly AutomationStudioActionConsequence[]) => unknown) | undefined;
    say?: ((text: string) => Promise<unknown>) | undefined;
  }) {}

  /** Whether asking has closed: nothing is put to a person from here. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** The start from `startFrom`, once, unless the caller already started (header). Before the first call or check. */
  async beforeActing(): Promise<void> {
    if (this.pendingStart) {
      await this.pendingStart;
      return;
    }
    if (this.started || !this.input.startFrom) return;
    this.starting ??= (async () => {
      const request = await this.input.startFrom!();
      // Told however it went, so a caller waiting on this start (another gate of the same build) is never left waiting.
      let result: AutomationStudioFlowBootstrapStartPermission = { classes: undefined };
      try {
        result = await this.start(request);
      } finally {
        await this.input.started?.(result, request);
      }
    })();
    await this.starting;
  }

  private starting: Promise<void> | undefined;
  private pendingStart: Promise<AutomationStudioFlowBootstrapStartPermission> | undefined;

  /** The task's one question, before anything acts (header): about the gated classes it is given that the chat has not answered. */
  async start(start: AutomationStudioFlowBootstrapStartRequest): Promise<AutomationStudioFlowBootstrapStartPermission> {
    // Install the pending start before running its body: concurrent domain calls and plan checks
    // must await this same answer, even when the thread's open hook calls back synchronously.
    this.pendingStart ??= Promise.resolve().then(() => this.begin(start));
    return await this.pendingStart;
  }

  private async begin(start: AutomationStudioFlowBootstrapStartRequest): Promise<AutomationStudioFlowBootstrapStartPermission> {
    const { gate } = this.input;
    this.started = true;
    if (start.held) gate.holdAnswer(start.held);
    for (const consequence of [...gate.permittedClasses, ...gate.declinedTaskClasses]) this.foreseen.add(consequence);
    const classes = start.classes ? automationStudioDestructiveConsequences(start.classes.filter(isAutomationStudioActionConsequence)) : undefined;
    try {
      // Already under way, or nobody to ask: the answer is held and nothing is asked.
      this.closed = true;
      if (!start.ask || !this.input.ask) return { classes };
      for (const consequence of classes ?? []) this.foreseen.add(consequence);
      const request = gate.raiseForTaskStart(classes ?? []);
      if (!request) return { classes };
      this.input.asked.add(request.requestId);
      const outcome = await this.input.ask(request);
      gate.settle(outcome);
      if (outcome !== "unanswered") await this.input.heard?.({ outcome, classes: [...request.missing], requestId: request.requestId, taskStart: true });
      return { classes, asked: request, outcome };
    } finally {
      // A closed wrapper alone is insufficient: checkFor would still create a request before the
      // wrapper rewrote its verdict, and legacy/candidate endings would read that stale request.
      gate.closeAsking();
    }
  }

  /** The first call the domain is handed is acting: the start is over. */
  acting(): void {
    if (this.started) this.close();
  }

  /** Ends the start of the task. */
  close(): void {
    this.closed = true;
    this.input.gate.closeAsking();
  }

  /** A person's answer to a question the gate put to them while asking was open. */
  async answered(request: AutomationStudioActionPermissionRequest, outcome: "granted" | "declined"): Promise<void> {
    // At a task's start the answer is about the class, as the chat keeps it: a no to one step is a no to deleting.
    if (this.started && outcome === "declined") this.input.gate.holdAnswer({ granted: [], declined: request.missing, requestId: request.requestId });
    for (const consequence of request.missing) this.foreseen.add(consequence);
    await this.input.heard?.({ outcome, classes: [...request.missing], requestId: request.requestId, taskStart: false });
  }

  /** A refusal once asking closed: nobody is asked, the domain is told so, and a class nobody foresaw is recorded and said once. */
  async unasked(decision: AutomationStudioActionPermissionVerdict): Promise<AutomationStudioActionPermissionVerdict> {
    if (decision.permitted || decision.declined) return decision;
    const fresh = decision.missing.filter((consequence) => !this.foreseen.has(consequence) && !this.told.has(consequence));
    if (fresh.length) {
      for (const consequence of fresh) this.told.add(consequence);
      await this.input.unforeseen?.(fresh);
      await this.say(fresh);
    }
    return { ...decision, requestId: null };
  }

  private async say(classes: readonly AutomationStudioActionConsequence[]): Promise<void> {
    if (!this.input.say) return;
    try {
      await this.input.say(automationStudioFlowBootstrapUnforeseenSaid(classes));
    } catch {
      /* best-effort: a thread that could not be written to changes nothing the run does. */
    }
  }
}
