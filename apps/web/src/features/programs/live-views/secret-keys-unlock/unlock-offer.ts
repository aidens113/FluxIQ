import type { SecretKeyLockedClient } from "fluxiq/secret-keys";

/** The ticket a browser sent its person here with, and which of their browsers it names. */
export type UnlockTicket = { ticket: string; holderId: string };

/** What this page may offer to unlock, and what it may only tell the person about. */
export type UnlockOffer = {
  /** Browsers the person may choose here: unlocked before, or the one they came from. */
  choosable: SecretKeyLockedClient[];
  /** Browsers nobody has unlocked, which only that browser can start: someone with a stolen cookie could have paired one. */
  waiting: SecretKeyLockedClient[];
  /** The one to name on the button, when there is exactly one to choose or the person came from it. */
  only: SecretKeyLockedClient | undefined;
};

export function unlockOffer(locked: readonly SecretKeyLockedClient[], ticket: UnlockTicket | undefined): UnlockOffer {
  const cameFrom = locked.find((client) => client.holderId === ticket?.holderId);
  const choosable = locked.filter((client) => client.neverUnlocked !== true || client === cameFrom);
  return {
    choosable,
    waiting: locked.filter((client) => client.neverUnlocked === true && client !== cameFrom),
    only: cameFrom ?? (choosable.length === 1 ? choosable[0] : undefined)
  };
}

/** The ticket in this page's address, set by a browser's Open FluxIQ. */
export function readUnlockTicket(hash: string): UnlockTicket | undefined {
  const ticket = new URLSearchParams(hash.replace(/^#/u, "")).get("unlock");
  const end = ticket?.lastIndexOf(".") ?? -1;
  return ticket && end > 0 ? { ticket, holderId: ticket.slice(0, end) } : undefined;
}
