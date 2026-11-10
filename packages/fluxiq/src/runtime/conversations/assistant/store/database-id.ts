import { createHash } from "node:crypto";

/**
 * The reserved database a person's panel threads live in: one per person, so a
 * thread is theirs by where it is stored, and nobody's id can be typed into a
 * request to reach another's. The user id is digested because the pool accepts
 * only letters, digits, dots, dashes and underscores, and a user id need not be
 * that; the digest is never shown.
 */
export function panelAssistantDatabaseId(userId: string): string {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) throw new Error("A panel thread needs a signed-in person.");
  return `person-${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;
}
