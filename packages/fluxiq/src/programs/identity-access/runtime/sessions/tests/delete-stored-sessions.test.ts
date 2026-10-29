import { describe, expect, it } from "vitest";
import type { Repository } from "../../../../database-manager/index.ts";
import type { StoredSession } from "../../stored-state.ts";
import { deleteStoredSessions } from "../delete-stored-sessions.ts";

describe("deleteStoredSessions", () => {
  it("removes each digest from memory and the store, counting those that existed in either", async () => {
    const sessions = new Map<string, StoredSession>([["digest.held", { digest: "digest.held", userId: "u", expiresAtMs: 1 }]]);
    const stored = new Set(["session:digest.held", "session:digest.stored"]);
    const deleted: string[] = [];
    const repository = {
      delete: async (id: string) => {
        deleted.push(id);
        return stored.delete(id);
      }
    } as unknown as Repository;
    await expect(deleteStoredSessions(sessions, repository, ["digest.held", "digest.stored", "digest.gone"])).resolves.toBe(2);
    expect(sessions.size).toBe(0);
    expect(deleted).toEqual(["session:digest.held", "session:digest.stored", "session:digest.gone"]);
    await expect(deleteStoredSessions(new Map(), undefined, ["digest.none"])).resolves.toBe(0);
  });
});
