// Money fields are marked in the schema (`usdAmount`), not guessed from names:
// the mark survives a description and the usual wrappers, a model sees the
// same JSON Schema, and a field named in dollars without the mark is refused.
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { carryOnTaskAttemptInput } from "../../automation-studio/index.ts";
import { programApiInput, programApiMoneyFields, usdAmount } from "../index.ts";

describe("usdAmount and moneyFields", () => {
  it("finds marked amounts through optional, nullable, default, nested objects and arrays", () => {
    const schema = z.object({
      projectId: z.string(),
      addUsd: usdAmount("Dollars to add."),
      tipUsd: usdAmount("A tip.").optional(),
      limits: z.object({ daily: usdAmount("Per day.").nullable().default(null) }).optional(),
      items: z.array(z.object({ price: usdAmount("Each.") })),
      fees: z.array(usdAmount("Each fee."))
    });
    expect(programApiMoneyFields(schema)).toEqual(["addUsd", "tipUsd", "limits.daily", "items[].price", "fees[]"]);
  });

  it("keeps the mark through a later description, and shows a model the same JSON Schema as an unmarked number", () => {
    const marked = programApiInput(z.object({ amount: usdAmount("Dollars.").describe("Dollars, said again.") }));
    const plain = programApiInput(z.object({ amount: z.number().min(0).describe("Dollars, said again.") }));
    expect(marked.moneyFields()).toEqual(["amount"]);
    expect(marked.jsonSchema()).toEqual(plain.jsonSchema());
    expect(plain.moneyFields()).toEqual([]);
  });

  it("refuses a field named in dollars that is not marked, wherever it is", () => {
    expect(() => programApiInput(z.object({ budgetUsd: z.number() })).moneyFields()).toThrow(/budgetUsd: an amount of US dollars must be a usdAmount/u);
    expect(() => programApiMoneyFields(z.object({ limits: z.object({ capUsd: z.number().optional() }) }))).toThrow(/limits\.capUsd/u);
    // A new check after the mark is a new schema: the mark is gone, and the name says so.
    expect(() => programApiMoneyFields(z.object({ addUsd: usdAmount("Dollars.").max(5) }))).toThrow(TypeError);
  });

  it("marks the one live amount: the budget a carry-on adds", () => {
    expect(carryOnTaskAttemptInput.moneyFields()).toEqual(["addUsd"]);
    expect(carryOnTaskAttemptInput.jsonSchema().properties).toMatchObject({ addUsd: { type: "number", minimum: 0 } });
  });
});
