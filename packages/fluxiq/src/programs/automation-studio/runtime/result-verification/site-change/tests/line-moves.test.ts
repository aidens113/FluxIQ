// A changed row's move read from its lines (t775, `../line-moves.ts`): a gone
// line and an added line identical except for exactly one whole number, and
// nothing else.
import { describe, expect, it } from "vitest";
import { automationStudioResultLineMoves } from "../index.ts";

const moves = (gone: string[], added: string[], cut?: { gone: number; added: number }) => automationStudioResultLineMoves({ gone, added, ...(cut ? { cut } : {}) });

describe("reading a row's move from its lines", () => {
  it("reads one whole number moved, up or down, and leaves lines that pair with nothing alone", () => {
    expect(moves(["Dune — Qty 9"], ["Dune — Qty 10"])).toEqual([{ gone: "Dune — Qty 9", added: "Dune — Qty 10", by: 1 }]);
    expect(moves(["Dune — Qty 5"], ["Dune — Qty 3"])).toEqual([{ gone: "Dune — Qty 5", added: "Dune — Qty 3", by: -2 }]);
    expect(moves([], ["Emma — Qty 1"])).toEqual([]);
    expect(moves(["Dune — Qty 9", "Emma — Qty 1"], ["Dune — Qty 10"])).toEqual([{ gone: "Dune — Qty 9", added: "Dune — Qty 10", by: 1 }]);
    expect(automationStudioResultLineMoves(undefined)).toEqual([]);
  });

  it("reads no word, so the same move reads alike in any language", () => {
    expect(moves(["Dune — Menge 9"], ["Dune — Menge 10"])?.[0]?.by).toBe(1);
    expect(moves(["9 × Dune"], ["12 × Dune"])?.[0]?.by).toBe(3);
  });

  it("pairs nothing where two numbers moved in one line, a word changed, or the number is not whole", () => {
    expect(moves(["Dune — Qty 9 — 90 total"], ["Dune — Qty 10 — 100 total"])).toEqual([]);
    expect(moves(["Dune — Qty 9"], ["Emma — Qty 10"])).toEqual([]);
    expect(moves(["Dune — 9.99"], ["Dune — 10.99"])).toEqual([]);
    expect(moves(["Dune — 1,000"], ["Dune — 1,001"])).toEqual([]);
  });

  it("gives no reading where a line pairs several ways by different moves, or the lines were cut", () => {
    expect(moves(["Dune 9 of 12"], ["Dune 10 of 12", "Dune 9 of 15"])).toBeUndefined();
    expect(moves(["Dune — Qty 9"], ["Dune — Qty 10"], { gone: 0, added: 4 })).toBeUndefined();
    expect(moves([`Dune — Qty 9 ${"x".repeat(186)}…`], [`Dune — Qty 10 ${"x".repeat(185)}…`])).toBeUndefined();
    expect(moves(["Dune: The Desert Pla… — Qty 9"], ["Dune: The Desert Pla… — Qty 10"])?.[0]?.by).toBe(1);
  });

  it("reads lines pairing several ways by one same move as one move each, one to one", () => {
    expect(moves(["Dune — Qty 9"], ["Dune — Qty 10", "Dune — Qty 10"])).toEqual([{ gone: "Dune — Qty 9", added: "Dune — Qty 10", by: 1 }]);
  });
});
