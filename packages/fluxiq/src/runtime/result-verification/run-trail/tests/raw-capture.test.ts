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
    expect(kept.snapshot).toBe("[the host's capture of the page this step left: shown as found.view]");
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
