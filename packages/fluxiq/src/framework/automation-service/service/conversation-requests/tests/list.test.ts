// Covers list.ts. A list across projects reads each project on its own: one
// whose conversations cannot be read is named with its reason, and the others
// are still listed, so one broken project never empties the whole list.

import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioConversations } from "../../../../../runtime/conversations/index.ts";
import { listConversationsForRequest } from "../list.ts";
import type { AutomationStudioConversationRequestService } from "../types.ts";

function serviceWith(projectIds: string[], listConversations: (input: { projectId: string; limit?: number }) => Promise<unknown[]>): AutomationStudioConversationRequestService {
  return {
    assertProjectDomainAccess: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue({ projects: projectIds.map((id) => ({ id })) }),
    conversations: { listConversations: vi.fn(listConversations) } as unknown as AutomationStudioConversations
  };
}

const thread = (projectId: string) => ({ conversationId: `conversation.${projectId}`, projectId });

describe("listConversationsForRequest", () => {
  it("lists every readable project and names the one that could not be read, with why", async () => {
    const service = serviceWith(["project.one", "project.two", "project.three"], async ({ projectId }) => {
      if (projectId === "project.two") throw new Error("SQLITE_CORRUPT: database disk image is malformed");
      return [thread(projectId)];
    });

    const listing = await listConversationsForRequest(service, "domain.one", { projectId: null });

    expect(listing.conversations.map((conversation) => conversation.conversationId)).toEqual(["conversation.project.one", "conversation.project.three"]);
    expect(listing.unreadableProjects).toEqual([{ projectId: "project.two", reason: "SQLITE_CORRUPT: database disk image is malformed" }]);
    expect(service.conversations.listConversations).toHaveBeenCalledTimes(3);
  });

  it("names a failure that is not an Error by its text", async () => {
    const service = serviceWith(["project.one"], async () => {
      throw "store closed";
    });

    await expect(listConversationsForRequest(service, null, {})).resolves.toEqual({ conversations: [], unreadableProjects: [{ projectId: "project.one", reason: "store closed" }] });
  });

  it("answers a fully readable list with no unreadable projects", async () => {
    const service = serviceWith(["project.one", "project.two"], async ({ projectId }) => [thread(projectId)]);

    await expect(listConversationsForRequest(service, null, {})).resolves.toEqual({
      conversations: [thread("project.one"), thread("project.two")],
      unreadableProjects: []
    });
  });

  it("still refuses a named project whose conversations cannot be read, as the one thing asked for", async () => {
    const service = serviceWith(["project.one"], async () => {
      throw new Error("database is locked");
    });

    await expect(listConversationsForRequest(service, null, { projectId: "project.one" })).rejects.toThrow("database is locked");
    expect(service.assertProjectDomainAccess).toHaveBeenCalledWith("project.one", null);
  });
});
