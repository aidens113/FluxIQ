// The person's current project as a topic (t1095): a stream hears a change each time that person's value is
// set, in their workspace, and nobody else's; it names nothing, and stops hearing when the stream ends.

import { describe, expect, it } from "vitest";
import { panelContextChanges } from "../context";
import type { PanelChange } from "../types";

function sink() {
  const heard: PanelChange[] = [];
  return { heard, sink: { changed: (change: PanelChange) => heard.push(change), fail: (error: unknown) => { throw error; }, opensAfter: () => undefined } };
}

describe("the person's current project as a change topic", () => {
  it("tells the person's own streams, in their own workspace, and nobody else's", () => {
    const alice = sink();
    const aliceElsewhere = sink();
    const bob = sink();
    const stops = [
      panelContextChanges.topic({ workspaceId: "w.1", userId: "alice" }).start(alice.sink),
      panelContextChanges.topic({ workspaceId: "w.2", userId: "alice" }).start(aliceElsewhere.sink),
      panelContextChanges.topic({ workspaceId: "w.1", userId: "bob" }).start(bob.sink)
    ];
    panelContextChanges.signal({ workspaceId: "w.1", userId: "alice" });
    expect(alice.heard).toEqual([{ topic: "context" }]);
    expect(aliceElsewhere.heard).toEqual([]);
    expect(bob.heard).toEqual([]);
    stops[0]!();
    panelContextChanges.signal({ workspaceId: "w.1", userId: "alice" });
    expect(alice.heard).toHaveLength(1);
    for (const stop of stops.slice(1)) stop();
  });
});
