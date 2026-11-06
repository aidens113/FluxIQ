// What the answer turn's buttons do: the four that call the results port (the two
// exports, Run again, Add budget and carry on), each saying plainly what came of it, and
// the ones that are the host's, passed straight through. A request never throws through a
// port; a rejection is still caught, so a press never leaves the button busy.

import type { ChatResult } from "../../ports/index.ts";
import type { AnswerHost } from "./host.ts";
import type { AnswerBusy, AnswerHandlers, AnswerState } from "./state.ts";
import type { AnswerModel } from "../model/index.ts";

/** The view's hooks: its current model and state, and a redraw. */
export type AnswerHandlersDeps = { host: AnswerHost; model(): AnswerModel | undefined; state: AnswerState; redraw(): void };

async function asked<T>(call: () => Promise<ChatResult<T>>): Promise<ChatResult<T>> {
  try {
    return await call();
  } catch {
    return { ok: false, sentence: "Something went wrong. Try again." };
  }
}

/** The handlers for one answer turn. */
export function createAnswerHandlers(deps: AnswerHandlersDeps): AnswerHandlers {
  const { host, state } = deps;
  /** Runs `call` with `busy` set, then says `done` or the failure's sentence. */
  async function press<T>(busy: AnswerBusy, call: () => Promise<ChatResult<T>>, done: (value: T) => string, failed: string): Promise<void> {
    state.busy = busy;
    state.status = undefined;
    deps.redraw();
    const answer = await asked(call);
    state.busy = undefined;
    state.status = answer.ok ? { text: done(answer.value), tone: "ok" } : { text: `${failed} ${answer.sentence}`, tone: "error" };
    deps.redraw();
    if (answer.ok) host.onChanged?.();
  }
  return {
    toggleRows() {
      state.expanded = !state.expanded;
      deps.redraw();
    },
    exportRows(format) {
      const rows = deps.model()?.rows;
      const model = deps.model();
      if (rows === undefined || model === undefined || host.results === undefined) return;
      const results = host.results;
      void press(format, () => results.exportRows({ projectId: model.projectId, runId: rows.runId, datasetId: rows.datasetId, format }), (value) => `Saved ${value.fileName}.`, `I could not make the ${format.toUpperCase()} file.`);
    },
    runAgain() {
      const model = deps.model();
      if (model === undefined || host.results === undefined) return;
      const results = host.results;
      void press("run_again", () => results.runAgain({ projectId: model.projectId, taskId: model.taskId }), () => "Started again.", "I could not start it again.");
    },
    addBudget() {
      const model = deps.model();
      const add = model?.addBudget;
      const results = host.results;
      if (model === undefined || add === undefined || results?.addBudgetAndCarryOn === undefined) return;
      const carryOn = results.addBudgetAndCarryOn.bind(results);
      void press("budget", () => carryOn({ projectId: model.projectId, attemptId: model.attemptId, addUsd: add.addUsd }), () => "Budget added. Carrying on.", "I could not add the budget.");
    },
    carryOn() {
      const model = deps.model();
      const go = model?.carryOn;
      const results = host.results;
      if (model === undefined || go === undefined || results?.addBudgetAndCarryOn === undefined) return;
      const carryOn = results.addBudgetAndCarryOn.bind(results);
      void press("budget", () => carryOn({ projectId: model.projectId, attemptId: model.attemptId, addUsd: go.addUsd }), () => (go.addUsd > 0 ? "Budget added. Carrying on." : "Carrying on."), "I could not carry it on.");
    },
    whatIDid: () => host.onWhatIDid?.(deps.model()?.attemptId ?? ""),
    keepGoing() {
      const model = deps.model();
      const results = host.results;
      // An attempt its Core cut off goes on from where it stopped, and a message to the model would not carry it on. One stuck in a loop is told to carry on instead.
      if (model?.keepGoingCarriesOn === true && results?.addBudgetAndCarryOn !== undefined) {
        const carryOn = results.addBudgetAndCarryOn.bind(results);
        void press("budget", () => carryOn({ projectId: model.projectId, attemptId: model.attemptId, addUsd: 0 }), () => "Carrying on.", "I could not carry it on.");
        return;
      }
      host.onKeepGoing?.(model?.attemptId ?? "");
    },
    tellMore: () => host.onTellMore?.(deps.model()?.attemptId ?? ""),
    stop: () => host.onStop?.(deps.model()?.attemptId ?? "")
  };
}
