// Covers conversation-relay.ts over a real signal hub: each project chat's change is handed on by id and project
// alone, a person's panel thread is never handed on, and stopping the relay stops it.
import { describe, expect, it } from "vitest";

import type { ClientGatewayConversationChanged } from "../../../../../client-gateway/index.ts";
import { AutomationStudioConversationSignalHub } from "../../../../../runtime/conversations/index.ts";
import { relayProjectConversationChanges } from "../index.ts";

describe("the relay from this runtime's chat changes to its gateway", () => {
  it("hands on a project chat's change by id and project, never a panel thread's, until stopped", () => {
    const hub = new AutomationStudioConversationSignalHub();
    const published: ClientGatewayConversationChanged[] = [];
    const stop = relayProjectConversationChanges({ signals: hub, publish: (change) => { published.push(change); } });

    hub.signal({ kind: "project", projectId: "project.a" }, "conversation.1");
    hub.signal({ kind: "panel", userId: "user.alice" }, "conversation.panel");
    stop();
    hub.signal({ kind: "project", projectId: "project.a" }, "conversation.2");

    expect(published).toEqual([{ conversationId: "conversation.1", projectId: "project.a" }]);
  });
});
