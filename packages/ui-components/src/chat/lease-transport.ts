// A transport that answers for one owner of the chat only. When that owner is
// no longer current, every request is answered as a failure and never reaches
// the client: a reply for the chat's last context must land nowhere. Hearing
// pushed activity is not a request, so `activity.subscribe` is passed through;
// the activity feed already guards its own lifecycle. The change feed
// (`changes`) is pushed too and passed through the same way: the chat
// unsubscribes it when the owner changes.

import type { ChatResult, ChatTransport } from "./ports/index.ts";

/** What every request of a lapsed lease is answered with. */
export const CONTEXT_CHANGED = "This chat context has changed. Try again.";

/** Makes `call` answer `CONTEXT_CHANGED` once `valid` says the lease has lapsed. */
function leased<Args extends unknown[], Value>(
  valid: () => boolean,
  call: (...args: Args) => Promise<ChatResult<Value>>
): (...args: Args) => Promise<ChatResult<Value>> {
  return (...args) => {
    if (valid()) {
      return call(...args);
    }
    return Promise.resolve<ChatResult<Value>>({ ok: false, sentence: CONTEXT_CHANGED });
  };
}

/** A copy of `transport` whose requests are answered only while `valid()` holds. */
export function leaseTransport(transport: ChatTransport, valid: () => boolean): ChatTransport {
  const { conversation, activity, runs, recordings, models, changes, results } = transport;
  const listAllThreads = conversation.listAllThreads;
  const setOverlay = activity.setOverlay;
  const openInstructions = runs.openInstructions;
  const addBudgetAndCarryOn = results?.addBudgetAndCarryOn;
  return {
    conversation: {
      listThreads: leased(valid, (query) => conversation.listThreads(query)),
      readThread: leased(valid, (query) => conversation.readThread(query)),
      send: leased(valid, (message) => conversation.send(message)),
      answer: leased(valid, (answer) => conversation.answer(answer)),
      ...(listAllThreads === undefined ? {} : { listAllThreads: leased(valid, (query) => listAllThreads.call(conversation, query)) })
    },
    activity: {
      read: leased(valid, () => activity.read()),
      subscribe: (listener) => activity.subscribe(listener),
      ...(setOverlay === undefined ? {} : { setOverlay: leased(valid, (overlay) => setOverlay.call(activity, overlay)) })
    },
    runs: {
      stop: leased(valid, (target) => runs.stop(target)),
      takeOver: leased(valid, (target) => runs.takeOver(target)),
      handBack: leased(valid, (target) => runs.handBack(target)),
      ...(openInstructions === undefined ? {} : { openInstructions: leased(valid, (runId) => openInstructions.call(runs, runId)) })
    },
    ...(recordings === undefined ? {} : { recordings: { list: leased(valid, (query) => recordings.list(query)) } }),
    ...(models === undefined ? {} : { models: { readKeys: leased(valid, () => models.readKeys()) } }),
    ...(changes === undefined ? {} : { changes: { subscribe: (listener) => changes.subscribe(listener) } }),
    ...(results === undefined ? {} : {
      results: {
        readThread: leased(valid, (query) => results.readThread(query)),
        readAttempt: leased(valid, (query) => results.readAttempt(query)),
        exportRows: leased(valid, (query) => results.exportRows(query)),
        runAgain: leased(valid, (query) => results.runAgain(query)),
        ...(addBudgetAndCarryOn === undefined ? {} : { addBudgetAndCarryOn: leased(valid, (query) => addBudgetAndCarryOn.call(results, query)) })
      }
    })
  };
}
