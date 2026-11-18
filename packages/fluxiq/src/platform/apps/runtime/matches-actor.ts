import type { AppAuthorityActor } from "../model/index.ts";
import { requireAppActor } from "./actor.ts";

export function matchesAppActor(current: AppAuthorityActor | null, expected: AppAuthorityActor, now: number): boolean {
  try {
    requireAppActor(current, now, expected);
    return true;
  } catch { return false; }
}
