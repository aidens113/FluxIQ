/**
 * Resolves, and records, who owns resources of one kind. A program registers
 * one per kind it owns (`GlobalProgramApiRegistry.registerResourceOwners`).
 * `ownerOf` answers a user id, or null for none or unknown (never throws for
 * an unknown id). `recordOwner` is called after a declared `creates`.
 */
export type ProgramResourceOwnerResolver = {
  ownerOf(id: string): Promise<string | null>;
  recordOwner?(id: string, userId: string): Promise<void>;
};
