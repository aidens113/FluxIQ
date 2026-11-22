// A turn for timers between two asks of one check after an unreadable reply (t979).
//
// What ends a check whose replies stay unreadable is its deadline, and a deadline is a timer. A provider that answers
// without waiting on anything -- a cached or in-process model, a scripted one -- answers in promise jobs alone, and a
// loop of such asks would never let a timer run: the deadline that bounds it would never fire. So each ask after an
// unreadable reply first lets pending timers run. It waits for nothing else.

/** Resolves once pending timers, the check's deadline among them, have had their turn. */
export function automationStudioResultUnreadableTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}
