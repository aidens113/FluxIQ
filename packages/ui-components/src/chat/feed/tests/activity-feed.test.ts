// The activity feed's rules: the relay's `{ ok: true, state }` read and its
// `changed` pushes, "Unknown FluxIQ extension message." as offline for good,
// a read older than a push dropped, a failed read retried, and the overlay
// preference sent and taken back from the relay's answer.

import assert from "node:assert/strict";
import { test } from "vitest";
import { activityEvent, relayState } from "../../tests/activity-fixture.ts";
import { createActivityFeed, type ActivityPushListener } from "../activity-feed.ts";
import { activityOver, TEST_ACTIVITY_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";

const UNSUPPORTED: ChatResult<unknown> = { ok: false, sentence: "This extension doesn't support that yet.", detail: "Unknown FluxIQ extension message.", unsupported: true };
const RESTARTED: ChatResult<unknown> = { ok: false, sentence: "The extension restarted." };

function harness(answer: (message: TestMessage) => ChatResult<unknown> | Promise<ChatResult<unknown>>) {
  const sent: TestMessage[] = [];
  const listeners = new Set<ActivityPushListener>();
  let changes = 0;
  const feed = createActivityFeed({
    activity: activityOver(async (message) => {
      sent.push(message);
      return await answer(message);
    }, (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    })
  }, () => (changes += 1));
  const push = (message: unknown) => {
    for (const listener of [...listeners]) listener(message);
  };
  return { feed, sent, listeners, push, changes: () => changes };
}

test("a read takes the relay's state, including an empty one after a worker restart", async () => {
  const empty = { current: null, recent: [], overlay: "collapsed" as const, live: false };
  const { feed, sent } = harness(() => ({ ok: true, value: { ok: true, state: empty } }));
  assert.equal(feed.snapshot().reach, "loading");
  await feed.read();
  assert.deepEqual(sent, [{ type: TEST_ACTIVITY_MESSAGES.read }]);
  assert.equal(feed.snapshot().reach, "ready");
  assert.deepEqual(feed.snapshot().state, empty);
});

test("pushes replace the state; malformed states are ignored", () => {
  const { feed, push, changes } = harness(() => RESTARTED);
  feed.start();
  const state = relayState([activityEvent(1)]);
  push({ type: TEST_ACTIVITY_MESSAGES.changed, state: { recent: "no" } });
  assert.equal(changes(), 0);
  push({ type: TEST_ACTIVITY_MESSAGES.changed, state });
  assert.equal(feed.snapshot().reach, "ready");
  assert.equal(feed.snapshot().state.current?.sequence, 1);
  assert.equal(changes(), 1);
});

test("start subscribes once and stop unsubscribes", () => {
  const { feed, listeners } = harness(() => RESTARTED);
  feed.start();
  feed.start();
  assert.equal(listeners.size, 1);
  feed.stop();
  assert.equal(listeners.size, 0);
});

test("a read asked for before a push is older than it and is dropped", async () => {
  let release: (result: ChatResult<unknown>) => void = () => undefined;
  const { feed, push } = harness(() => new Promise((resolve) => (release = resolve)));
  feed.start();
  const reading = feed.read();
  push({ type: TEST_ACTIVITY_MESSAGES.changed, state: relayState([activityEvent(7)]) });
  release({ ok: true, value: { ok: true, state: relayState([activityEvent(3)]) } });
  await reading;
  assert.equal(feed.snapshot().state.current?.sequence, 7);
});

test("Unknown FluxIQ extension message. is offline for good: no more reads, no overlay changes", async () => {
  const { feed, sent } = harness(() => UNSUPPORTED);
  await feed.read();
  assert.equal(feed.snapshot().reach, "unsupported");
  await feed.read();
  await feed.setOverlay("hidden");
  assert.equal(sent.length, 1);
});

test("a failed read says why and the next read tries again", async () => {
  let fail = true;
  const { feed } = harness(() => (fail ? RESTARTED : { ok: true, value: { ok: true, state: relayState([]) } }));
  await feed.read();
  assert.deepEqual([feed.snapshot().reach, feed.snapshot().readError], ["failed", "The extension restarted."]);
  fail = false;
  await feed.read();
  assert.deepEqual([feed.snapshot().reach, feed.snapshot().readError], ["ready", undefined]);
});

test("a failed re-read keeps the state it had", async () => {
  let fail = false;
  const { feed } = harness(() => (fail ? RESTARTED : { ok: true, value: { ok: true, state: relayState([activityEvent(2)]) } }));
  await feed.read();
  fail = true;
  await feed.read();
  assert.equal(feed.snapshot().reach, "ready");
  assert.equal(feed.snapshot().state.current?.sequence, 2);
});

test("the overlay preference is sent, and the relay's answer is what shows", async () => {
  const { feed, sent } = harness((message) => message.type === TEST_ACTIVITY_MESSAGES.setOverlay
    ? { ok: true, value: { ok: true, state: relayState([], { overlay: message.overlay as "hidden" }) } }
    : { ok: true, value: { ok: true, state: relayState([]) } });
  await feed.read();
  await feed.setOverlay("expanded");
  assert.equal(sent.length, 1, "the preference already showing is not sent");
  const saving = feed.setOverlay("hidden");
  assert.equal(feed.snapshot().overlaySaving, true);
  await saving;
  assert.deepEqual(sent[1], { type: TEST_ACTIVITY_MESSAGES.setOverlay, overlay: "hidden" });
  assert.equal(feed.snapshot().state.overlay, "hidden");
  assert.equal(feed.snapshot().overlaySaving, false);
});

test("a failed overlay change says so and keeps the old preference", async () => {
  const { feed } = harness((message) => message.type === TEST_ACTIVITY_MESSAGES.setOverlay ? RESTARTED : { ok: true, value: { ok: true, state: relayState([]) } });
  await feed.read();
  await feed.setOverlay("collapsed");
  assert.equal(feed.snapshot().overlayError, "Couldn't change the on-page status. Try again.");
  assert.equal(feed.snapshot().state.overlay, "expanded");
});

function deferred() {
  let resolve!: (result: ChatResult<unknown>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ChatResult<unknown>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const success = (sequence: number, overlay: "expanded" | "collapsed" | "hidden" = "expanded"): ChatResult<unknown> => ({ ok: true, value: { state: relayState([activityEvent(sequence)], { overlay }) } });
test("newer read completion wins even without an intervening push", async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const { feed } = harness(() => (++calls === 1 ? first.promise : second.promise));
  const older = feed.read(), newer = feed.read();
  second.resolve(success(9));
  await newer;
  first.resolve(success(2));
  await older;
  assert.equal(feed.snapshot().state.current?.sequence, 9);
});
test("stop invalidates old completions and listeners while restart permits new requests", async () => {
  const old = deferred();
  let calls = 0;
  const { feed, listeners, changes } = harness(() => (++calls === 1 ? old.promise : success(8)));
  feed.start();
  const staleListener = [...listeners][0]!;
  const reading = feed.read();
  feed.stop();
  feed.start();
  await feed.read();
  const before = changes();
  staleListener({ type: TEST_ACTIVITY_MESSAGES.changed, state: relayState([activityEvent(1)]) });
  old.resolve(success(2));
  await reading;
  assert.equal(feed.snapshot().state.current?.sequence, 8);
  assert.equal(changes(), before);
});
test("overlay acknowledgement cannot replace newer pushed activity", async () => {
  const pending = deferred();
  const { feed, push } = harness(() => pending.promise);
  feed.start();
  const saving = feed.setOverlay("hidden");
  push({ type: TEST_ACTIVITY_MESSAGES.changed, state: relayState([activityEvent(9)], { overlay: "collapsed" }) });
  pending.resolve(success(2, "hidden"));
  await saving;
  assert.equal(feed.snapshot().state.current?.sequence, 9);
  assert.equal(feed.snapshot().state.overlay, "collapsed");
  assert.equal(feed.snapshot().overlaySaving, false);
});

test("stopped overlay completion cannot release a newer operation or republish state", async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const { feed, changes } = harness(() => (++calls === 1 ? first.promise : second.promise));
  const old = feed.setOverlay("hidden");
  feed.stop();
  assert.equal(feed.snapshot().overlaySaving, false);
  const fresh = feed.setOverlay("collapsed"), before = changes();
  first.resolve(success(2, "hidden"));
  await old;
  assert.equal(feed.snapshot().overlaySaving, true);
  assert.equal(feed.snapshot().state.overlay, "expanded");
  assert.equal(changes(), before);
  second.resolve(success(8, "collapsed"));
  await fresh;
  assert.equal(feed.snapshot().overlaySaving, false);
  assert.equal(feed.snapshot().state.current?.sequence, 8);
});
test("stopped overlay rejection cannot set an error or release a fresh save", async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const { feed } = harness(() => (++calls === 1 ? first.promise : second.promise));
  const old = feed.setOverlay("hidden");
  feed.stop();
  const fresh = feed.setOverlay("collapsed");
  first.reject(Error("synthetic private"));
  await old;
  assert.equal(feed.snapshot().overlaySaving, true);
  assert.equal(feed.snapshot().overlayError, undefined);
  second.resolve(success(4, "collapsed"));
  await fresh;
});
test("fresh direct read after stop works without subscribing", async () => {
  const { feed, listeners, sent } = harness(() => success(6));
  feed.stop();
  await feed.read();
  assert.equal(feed.snapshot().state.current?.sequence, 6);
  assert.equal(listeners.size, 0);
  assert.equal(sent.length, 1);
});
test("unexpected read rejection resolves with fixed retry feedback", async () => {
  let fail = true;
  const { feed } = harness(() => {
    if (fail) throw Error("synthetic private");
    return success(6);
  });
  await assert.doesNotReject(feed.read());
  assert.equal(feed.snapshot().reach, "failed");
  assert.equal(feed.snapshot().readError, "Couldn't read activity. Try again.");
  fail = false;
  await feed.read();
  assert.equal(feed.snapshot().reach, "ready");
  assert.equal(feed.snapshot().readError, undefined);
});
test("unexpected re-read rejection preserves confirmed activity", async () => {
  let fail = false;
  const { feed } = harness(() => {
    if (fail) throw Error("synthetic private");
    return success(6);
  });
  await feed.read();
  fail = true;
  await feed.read();
  assert.equal(feed.snapshot().reach, "ready");
  assert.equal(feed.snapshot().state.current?.sequence, 6);
});
test("unexpected overlay rejection releases the lock and permits explicit retry", async () => {
  let fail = true;
  const { feed, sent } = harness(() => {
    if (fail) throw Error("synthetic private");
    return success(7, "hidden");
  });
  await assert.doesNotReject(feed.setOverlay("hidden"));
  assert.equal(feed.snapshot().overlaySaving, false);
  assert.equal(feed.snapshot().overlayError, "Couldn't change the on-page status. Try again.");
  fail = false;
  await feed.setOverlay("hidden");
  assert.equal(sent.length, 2);
  assert.equal(feed.snapshot().overlayError, undefined);
  assert.equal(feed.snapshot().state.overlay, "hidden");
});
test("duplicate overlay activation retains its synchronous mutation lock", async () => {
  const pending = deferred();
  const { feed, sent } = harness(() => pending.promise);
  const first = feed.setOverlay("hidden"), second = feed.setOverlay("collapsed");
  await second;
  assert.equal(sent.length, 1);
  pending.resolve(success(3, "hidden"));
  await first;
});
test("overlay reply cannot overwrite a newer confirmed direct read", async () => {
  const pending = deferred();
  const { feed } = harness(message => message.type === TEST_ACTIVITY_MESSAGES.setOverlay ? pending.promise : success(9, "collapsed"));
  const saving = feed.setOverlay("hidden");
  await feed.read();
  pending.resolve(success(2, "hidden"));
  await saving;
  assert.equal(feed.snapshot().state.current?.sequence, 9);
  assert.equal(feed.snapshot().state.overlay, "collapsed");
});
test("read reply cannot overwrite a newer confirmed overlay observation", async () => {
  const pending = deferred();
  const { feed } = harness(message => message.type === TEST_ACTIVITY_MESSAGES.read ? pending.promise : success(9, "hidden"));
  const reading = feed.read();
  await feed.setOverlay("hidden");
  pending.resolve(success(2));
  await reading;
  assert.equal(feed.snapshot().state.current?.sequence, 9);
  assert.equal(feed.snapshot().state.overlay, "hidden");
});
test("unsupported status remains terminal across stop/start", async () => {
  const { feed, sent, push } = harness(() => UNSUPPORTED);
  await feed.read();
  feed.stop();
  feed.start();
  push({ type: TEST_ACTIVITY_MESSAGES.changed, state: relayState([activityEvent(9)]) });
  await feed.read();
  await feed.setOverlay("hidden");
  assert.equal(feed.snapshot().reach, "unsupported");
  assert.equal(sent.length, 1);
});
test("stopped read rejection cannot notify or overwrite later state", async () => {
  const pending = deferred();
  let calls = 0;
  const { feed, changes } = harness(() => (++calls === 1 ? pending.promise : success(9)));
  const old = feed.read();
  feed.stop();
  await feed.read();
  const before = changes();
  pending.reject(Error("synthetic private"));
  await old;
  assert.equal(changes(), before);
  assert.equal(feed.snapshot().state.current?.sequence, 9);
});

test("stop triggered by pending notification prevents an unissued overlay request", async () => {
  let calls = 0;
  let feed!: ReturnType<typeof createActivityFeed>;
  feed = createActivityFeed({ activity: activityOver(async () => {
   calls++;
    return success(1);
  }) }, () => { if (feed.snapshot().overlaySaving) feed.stop(); });
  await feed.setOverlay("hidden");
  assert.equal(calls, 0);
  assert.equal(feed.snapshot().overlaySaving, false);
});

test("pending overlay acknowledgement cannot republish after a read discovers unsupported", async () => {
  const pending = deferred();
  const { feed } = harness(message => message.type === TEST_ACTIVITY_MESSAGES.setOverlay ? pending.promise : UNSUPPORTED);
  const saving = feed.setOverlay("hidden");
  await feed.read();
  pending.resolve(success(9, "hidden"));
  await saving;
  assert.equal(feed.snapshot().reach, "unsupported");
  assert.equal(feed.snapshot().state.overlay, "expanded");
  assert.equal(feed.snapshot().overlaySaving, false);
});
