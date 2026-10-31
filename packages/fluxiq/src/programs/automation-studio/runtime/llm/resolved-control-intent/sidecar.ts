import type { AutomationStudioResolvedControlIntent } from "./contracts.ts";
import { automationStudioResolvedControlIntentNodeKey } from "./node-key.ts";

type Intents = ReadonlyMap<string, AutomationStudioResolvedControlIntent>;
const owned = new WeakMap<Intents, Intents>();

/** A frozen read-only view; neither consumers nor resolver answers can add keys. */
export function automationStudioResolvedControlIntents(values: Intents): Intents {
  const kept = new Map(values);
  const view: Intents = Object.freeze({
    size: kept.size,
    get: (key: string) => kept.get(key),
    has: (key: string) => kept.has(key),
    entries: () => kept.entries(),
    keys: () => kept.keys(),
    values: () => kept.values(),
    [Symbol.iterator]: () => kept[Symbol.iterator](),
    forEach: (callback: (value: AutomationStudioResolvedControlIntent, key: string, map: Intents) => void, thisArg?: unknown) => {
      kept.forEach((value, key) => callback.call(thisArg, value, key, view));
    }
  });
  owned.set(view, kept);
  return view;
}

/** Only maps this module produced carry authority; arbitrary maps carry none. */
export function automationStudioResolvedControlIntentFor(values: Intents | undefined, subflow: string, node: string): AutomationStudioResolvedControlIntent | undefined {
  return values && owned.get(values)?.get(automationStudioResolvedControlIntentNodeKey(subflow, node));
}
