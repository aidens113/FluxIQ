// t965: a saved Flow's step carries the host's raw capture of the page in its outputs beside the domain's view of the
// same page; the trail keeps the view and leaves the capture out (`../of/attempts.ts`). Live run
// `run-mwodpw10-3d5748ab`, judge 0117: three such captures, about 680 KB each as sent, made the 2.2 MB request the
// provider refused. `./fixtures/run-mwodpw10-read-entry.json` is that request's trail entry 21 (a read), as sent, with the
// capture's element lists cut to their first two items; the step's view after it is rebuilt from that entry's own
// `found.view` and the capture's address.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioResultTrailOfAttempts } from "../of/index.ts";

type Entry = { did: string; found: { outputs: JsonObject; view: { page: string } } };
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "fixtures", "run-mwodpw10-read-entry.json"), "utf8")) as { originalEntryChars: number; originalElements: number; entry: Entry };
const result = (fixture.entry.found.outputs.result as JsonObject).result as JsonObject;
const address = (result.snapshot as JsonObject).url as string;

/** The engine's traced step: what it answered, and the domain's view after it, which names the page it is of. */
const attempt = (view: boolean) => ({
  nodeId: "node.read",
  definitionId: fixture.entry.did,
  status: "succeeded",
  outputs: fixture.entry.found.outputs,
  ...(view ? { stateRefs: { afterAction: { summary: { location: address, page: fixture.entry.found.view.page } } } } : {})
});

describe("a saved Flow step's outputs in the trail", () => {
  it("leave out the host's capture of the page the view shows, and keep the view and everything else the step answered", () => {
    const [step] = automationStudioResultTrailOfAttempts([attempt(true)], [], ["page"]);
    const found = step!.found as { outputs: JsonObject; view: JsonObject };
    const kept = (found.outputs.result as JsonObject).result as JsonObject;
    expect(kept.snapshot).toBe("[the host's capture of the page: shown as a view, this step's or the one before it]");
    expect(kept.validation).toEqual(result.validation);
    expect(kept.extracted).toEqual(result.extracted);
    expect(kept.extraction).toEqual(result.extraction);
    expect(kept.url).toBe(address);
    expect(found.outputs.records).toEqual(fixture.entry.found.outputs.records);
    expect(found.view).toEqual({ page: fixture.entry.found.view.page });
    // The capture held every element of the page: 650 of them, 680 KB as sent in 0117.
    expect(fixture.originalElements).toBe(650);
    expect(JSON.stringify(step).length).toBeLessThan(fixture.originalEntryChars / 20);
  });

  it("keep the capture where the step has no view after it, so nothing of the page is lost", () => {
    const [step] = automationStudioResultTrailOfAttempts([attempt(false)], [], ["page"]);
    expect(((((step!.found as JsonObject).outputs as JsonObject).result as JsonObject).result as JsonObject).snapshot).toEqual(result.snapshot);
  });
});

// t967: run-mwohvt8n-a57cad8a's judge 0029: a press that opened a listing carried a 190 KB capture of the search page it
// was pressed on, which the view after it does not show and the step before it does. `./fixtures/run-mwohvt8n-press-entry.json`
// is that request's trail entry 3, as sent, with the capture's element lists cut to their first two items.
describe("a step that moved to another page", () => {
  type Moved = { originalEntryChars: number; originalElements: number; entry: Entry; viewBefore: string };
  const moved = JSON.parse(readFileSync(join(here, "fixtures", "run-mwohvt8n-press-entry.json"), "utf8")) as Moved;
  const answer = (moved.entry.found.outputs.result as JsonObject).result as JsonObject;
  const startedOn = (answer.snapshot as JsonObject).url as string;
  /** The listing it opened, as its view after it gives it (`URL ~?hash=...` against the listing's base). */
  const leftFor = "http://127.0.0.1:51574/scenarios/auction-marketplace/itm/176623309961?hash=item291f91d489&_trksid=p4429486.m570.l1313";

  it("leaves out the capture of the page it started on, which the step before shows, and keeps what it answered", () => {
    const [step] = automationStudioResultTrailOfAttempts([{
      nodeId: "node.press",
      definitionId: moved.entry.did,
      status: "succeeded",
      outputs: moved.entry.found.outputs,
      stateRefs: { beforeAction: { summary: { location: startedOn, page: moved.viewBefore } }, afterAction: { summary: { location: leftFor, page: moved.entry.found.view.page } } }
    }], [], ["page"]);
    const kept = (((step!.found as JsonObject).outputs as JsonObject).result as JsonObject).result as JsonObject;
    expect(kept.snapshot).toBe("[the host's capture of the page: shown as a view, this step's or the one before it]");
    expect(kept.url).toBe(answer.url);
    expect(kept.validation).toEqual(answer.validation);
    expect(moved.originalElements).toBe(248);
    expect(JSON.stringify(step).length).toBeLessThan(moved.originalEntryChars / 10);
  });
});
