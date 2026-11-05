// Only a question whose own answers include Stop puts the header's Stop away.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { CoreAsk } from "../../conversation/index.ts";
import { askOffersStop } from "../ask-offers-stop.ts";

const ask = (fields: Partial<CoreAsk>): CoreAsk => ({ askId: "ask-1", kind: "permission", status: "pending", ...fields }) as CoreAsk;

test("a person-only check offers its own Stop; a permission does not", () => {
  const check = ask({ askId: "person-needed.1", kind: "choice", options: [{ id: "person_done", label: "Continue" }, { id: "person_stop", label: "Stop" }] });
  assert.equal(askOffersStop(check), true);
  assert.equal(askOffersStop(ask({ kind: "confirm" })), false);
});
