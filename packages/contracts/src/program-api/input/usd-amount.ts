import { z } from "zod/v4";
import { USD_AMOUNTS } from "./usd-amounts.ts";

/**
 * An endpoint input field that is an amount of US dollars the call commits,
 * zero or more: the one way an input takes money. The field reads and is
 * described exactly as `z.number().min(0).describe(description)`; the mark is
 * not in its JSON Schema, so a model sees nothing new. The registry refuses
 * an assistant declaration whose input has one and no `spends`, so every
 * call that commits money says how much (`programApiMoneyFields`).
 */
export function usdAmount(description: string): z.ZodNumber {
  const schema = z.number().min(0).describe(description);
  USD_AMOUNTS.add(schema._zod.def);
  return schema;
}
